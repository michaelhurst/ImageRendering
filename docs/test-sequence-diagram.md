# API Test Sequence Diagram

```mermaid
sequenceDiagram
    participant Runner as Playwright Runner
    participant GS as Global Setup
    participant Fixtures as test-fixtures.ts
    participant Auth as auth.ts
    participant API as SmugMugAPI
    participant SM as SmugMug API (v2)
    participant Upload as upload.smugmug.com
    participant CDN as photos.smugmug.com

    Note over Runner,CDN: === Test Run Initialization ===

    Runner->>GS: globalSetup()
    GS->>GS: Delete .run-folder.json (clear stale state)

    Note over Runner,CDN: === First Test Starts ===

    Runner->>Fixtures: api fixture requested
    Fixtures->>Fixtures: Check fixtures/auth-state.json exists?

    alt No saved session
        Fixtures->>Auth: loginAndSaveState(page)
        Auth->>SM: GET /login
        Auth->>SM: POST login form (email + password)
        SM-->>Auth: Redirect to /app/dashboard
        Auth->>Auth: Save cookies to auth-state.json
    else Saved session exists
        Fixtures->>Fixtures: Load cookies from auth-state.json
        Fixtures->>Fixtures: Add cookies to page context
    end

    Fixtures->>API: new SmugMugAPI(page)
    Fixtures-->>Runner: api instance ready

    Note over Runner,CDN: === testAlbumKey Fixture (per test) ===

    Runner->>Fixtures: testAlbumKey fixture requested

    alt Run folder not yet created
        Fixtures->>Fixtures: Check .run-folder.json on disk?
        alt State file exists (another worker created it)
            Fixtures->>Fixtures: Load folderPath from disk
        else No state file
            Fixtures->>API: createFolder(nickname, "Test Run <timestamp>")
            API->>API: getCsrfToken()
            API->>SM: POST /api/v2!token?APIKey=<SESSION_API_KEY>
            SM-->>API: CSRF token
            API->>SM: POST /api/v2/folder/user/<nickname>!folders?APIKey=<key>
            Note right of SM: Headers: X-CSRF-Token, Content-Type: JSON
            SM-->>API: { Folder: { Uri, UrlPath } }
            API-->>Fixtures: folderPath
            Fixtures->>Fixtures: Save folderPath to .run-folder.json
        end
    end

    Fixtures->>API: createAlbumInFolder(folderPath, testTitle)
    API->>SM: POST /api/v2/folder<folderPath>!albums?APIKey=<key>
    Note right of SM: Headers: X-CSRF-Token, Content-Type: JSON
    SM-->>API: { Album: { AlbumKey, Uri } }
    API-->>Fixtures: albumKey
    Fixtures-->>Runner: testAlbumKey ready

    Note over Runner,CDN: === Test Execution (e.g., OR-01) ===

    Runner->>API: uploadImage(filePath, albumUri)
    API->>API: Read file, compute MD5
    API->>API: getCsrfToken() (cached)
    API->>Upload: POST / (binary body)
    Note right of Upload: Headers: X-Smug-AlbumUri, X-Smug-FileName,<br/>Content-MD5, X-CSRF-Token
    Upload-->>API: { Image: { ImageUri, URL } }
    API-->>Runner: imageKey

    Runner->>API: waitForSizeTiers(imageKey)
    API->>SM: GET /api/v2/image/<key>-0 (get WebUri)
    SM-->>API: { Image: { WebUri } }

    API->>API: Open new browser context
    API->>CDN: GET <WebUri> (triggers tier generation)
    CDN-->>API: 200 OK (page loaded)
    API->>API: Wait 5s for processing

    loop Poll until minTiers available
        API->>SM: GET /api/v2/image/<key>-0!sizedetails
        SM-->>API: { ImageSizeDetails: { tiers... } }
        alt Enough tiers
            API-->>Runner: ImageSizeTier[]
        else Not enough tiers
            API->>API: Wait 3s, retry
        end
    end

    Runner->>API: downloadBuffer(tierUrl)
    alt Normal response (inline image)
        API->>API: Open browser context (with cookies + Basic Auth)
        API->>CDN: GET <tierUrl>
        CDN-->>API: 200 OK (image bytes)
    else Download triggered (Content-Disposition: attachment)
        API->>API: Catch "Download is starting" error
        API->>API: Re-open context with acceptDownloads: true
        API->>CDN: GET <tierUrl>
        CDN-->>API: Download event fires
        API->>API: Read downloaded file from disk
    end
    API-->>Runner: Buffer

    Runner->>Runner: Validate image (sharp metadata, SSIM, etc.)
    Runner->>Runner: Assert expectations

    Note over Runner,CDN: === Subsequent Tests ===
    Note over Runner,CDN: Same flow but folder creation is skipped<br/>(reuses folderPath from memory or disk)
```

## Key Points

1. **One folder per run** — Created by the first test, persisted to `.run-folder.json`, reused by all subsequent tests
2. **One album per test** — Each test gets its own gallery inside the shared folder
3. **Session reuse** — Login happens once, cookies saved to `auth-state.json`
4. **CSRF token** — Acquired once per `SmugMugAPI` instance, cached for all write operations
5. **API key selection** — `SESSION_API_KEY` reads from `SMUGMUG_API_KEY_PRODUCTION` or `SMUGMUG_API_KEY_INSIDE` based on `ENVIRONMENT`
6. **Tier generation** — Triggered by navigating to the image's WebUri in a browser (SmugMug generates tiers on demand)
7. **Download handling** — Two paths: inline response (normal images) or download event (archived originals, GIFs)
