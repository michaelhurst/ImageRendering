/**
 * Fetches images from the SmugMug baseline gallery by filename.
 *
 * Uses the SmugMug API to list images in the baseline gallery album,
 * matches by FileName, and downloads the original archived image bytes.
 *
 * Caches downloaded images in memory so each file is fetched at most once
 * per test run.
 *
 * Environment-aware:
 *   - production: unauthenticated (public gallery on smugmug.com)
 *   - inside: uses HTTP Basic Auth from INSIDE_AUTH_USER / INSIDE_AUTH_PASS
 *
 * Usage:
 *   const gallery = new GalleryImages();
 *   const buffer = await gallery.fetchImage('c-sizing-landscape.jpg');
 */

import { request, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Gallery URLs and API base per environment
// ---------------------------------------------------------------------------

const GALLERY_CONFIG: Record<string, { galleryUrl: string; apiBase: string }> =
  {
    production: {
      galleryUrl:
        "https://automated-render-testing.smugmug.com/Baseline-Images",
      apiBase: "https://www.smugmug.com",
    },
    inside: {
      galleryUrl:
        "https://automated-render-testing.inside.smugmug.net/Baseline-Images",
      apiBase: "https://inside.smugmug.net",
    },
  };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryImageInfo {
  FileName: string;
  ImageKey: string;
  ArchivedUri: string;
  ArchivedMD5: string;
  ArchivedSize: number;
  Format: string;
  OriginalWidth: number;
  OriginalHeight: number;
  OriginalSize: number;
  WebUri: string;
  Title: string;
  Uris: Record<string, { Uri: string }>;
}

// ---------------------------------------------------------------------------
// GalleryImages class
// ---------------------------------------------------------------------------

export class GalleryImages {
  private env: string;
  private ctx: APIRequestContext | null = null;
  private imageIndex: Map<string, GalleryImageInfo> | null = null;
  private downloadCache: Map<string, Buffer> = new Map();
  private apiKey: string;

  constructor(env?: string) {
    this.env = env || process.env.ENVIRONMENT || "inside";
    if (!GALLERY_CONFIG[this.env]) {
      throw new Error(`No gallery config for ENVIRONMENT="${this.env}"`);
    }
    // Use the environment-specific API key
    this.apiKey =
      this.env === "production"
        ? process.env.SMUGMUG_API_KEY_PRODUCTION || ""
        : process.env.SMUGMUG_API_KEY_INSIDE || "";
  }

  /** Get the gallery URL for the current environment. */
  get galleryUrl(): string {
    return GALLERY_CONFIG[this.env].galleryUrl;
  }

  /** Append the API key to a URL (if available). */
  private appendApiKey(url: string): string {
    if (!this.apiKey) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}APIKey=${this.apiKey}`;
  }

  /** Create (or reuse) an API request context with appropriate auth. */
  private async getContext(): Promise<APIRequestContext> {
    if (this.ctx) return this.ctx;

    const config = GALLERY_CONFIG[this.env];
    const options: any = {
      baseURL: config.apiBase,
    };

    if (this.env === "inside") {
      options.httpCredentials = {
        username: process.env.INSIDE_AUTH_USER || "",
        password: process.env.INSIDE_AUTH_PASS || "",
      };
    }

    this.ctx = await request.newContext(options);
    return this.ctx;
  }

  /**
   * Fetch the album key from the gallery page URL, then list all images
   * in the album and index them by FileName.
   */
  private async buildIndex(): Promise<Map<string, GalleryImageInfo>> {
    if (this.imageIndex) return this.imageIndex;

    const ctx = await this.getContext();
    const config = GALLERY_CONFIG[this.env];

    // Look up the Baseline-Images album under the user's root
    const albumsUrl = this.appendApiKey(
      `${config.apiBase}/api/v2/folder/user/automated-render-testing!albums`,
    );
    const albumsRes = await ctx.get(albumsUrl, {
      headers: { Accept: "application/json" },
    });

    if (!albumsRes.ok()) {
      throw new Error(
        `Failed to list albums: ${albumsRes.status()} ${await albumsRes.text()}`,
      );
    }

    const albumsData = await albumsRes.json();
    const albums = albumsData?.Response?.Album || [];
    const baselineAlbum = albums.find(
      (a: any) =>
        a.Name === "Baseline Images" ||
        a.UrlName === "Baseline-Images" ||
        a.Name === "Baseline-Images",
    );

    if (!baselineAlbum) {
      const available = albums.map((a: any) => a.Name).join(", ");
      throw new Error(
        `Baseline-Images album not found. Available albums: ${available}`,
      );
    }

    const albumUri = baselineAlbum.Uri;
    console.log(
      `Gallery: Found "${baselineAlbum.Name}" (key: ${baselineAlbum.AlbumKey || baselineAlbum.Key})`,
    );
    return this.fetchAlbumImages(`${albumUri}!images`);
  }

  /** Paginate through album images and build the filename index. */
  private async fetchAlbumImages(
    albumImagesUri: string,
  ): Promise<Map<string, GalleryImageInfo>> {
    const ctx = await this.getContext();
    const config = GALLERY_CONFIG[this.env];
    this.imageIndex = new Map();

    let start = 1;
    const count = 200;
    let total = Infinity;

    while (start <= total) {
      const url = this.appendApiKey(
        `${config.apiBase}${albumImagesUri}?start=${start}&count=${count}`,
      );
      const res = await ctx.get(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok()) {
        throw new Error(
          `Failed to list album images: ${res.status()} ${await res.text()}`,
        );
      }

      const data = await res.json();
      const images: GalleryImageInfo[] = data?.Response?.AlbumImage || [];
      total = data?.Response?.Pages?.Total || images.length;

      for (const img of images) {
        if (img.FileName) {
          this.imageIndex.set(img.FileName, img);
        }
      }

      start += count;
    }

    console.log(
      `Gallery index built: ${this.imageIndex.size} images from ${this.galleryUrl}`,
    );
    return this.imageIndex;
  }

  /**
   * Download an image from the gallery by its filename.
   * Returns the original archived image bytes as a Buffer.
   * Results are cached — subsequent calls for the same filename return instantly.
   */
  async fetchImage(filename: string): Promise<Buffer> {
    // Check cache first
    const cached = this.downloadCache.get(filename);
    if (cached) return cached;

    // Build index if needed
    const index = await this.buildIndex();
    const entry = index.get(filename);
    if (!entry) {
      const available = Array.from(index.keys()).sort().join(", ");
      throw new Error(
        `Image "${filename}" not found in gallery. Available: ${available}`,
      );
    }

    // Download the archived (original) image
    const ctx = await this.getContext();
    const downloadUrl = entry.ArchivedUri;
    if (!downloadUrl) {
      throw new Error(
        `No ArchivedUri for "${filename}" — image may not have finished processing`,
      );
    }

    const res = await ctx.get(downloadUrl);
    if (!res.ok()) {
      throw new Error(
        `Failed to download "${filename}" from ${downloadUrl}: ${res.status()}`,
      );
    }

    const buffer = Buffer.from(await res.body());
    this.downloadCache.set(filename, buffer);
    return buffer;
  }

  /**
   * Get metadata for an image without downloading it.
   * Returns dimensions, file size, format, MD5, and other fields
   * from the gallery index (populated by the album listing API).
   *
   * No network request is made beyond the initial album listing.
   */
  async getImageInfo(filename: string): Promise<GalleryImageInfo> {
    const index = await this.buildIndex();
    const entry = index.get(filename);
    if (!entry) {
      const available = Array.from(index.keys()).sort().join(", ");
      throw new Error(
        `Image "${filename}" not found in gallery. Available: ${available}`,
      );
    }
    return entry;
  }

  /**
   * List all filenames available in the gallery.
   * Useful for tests that need to iterate over all images (e.g., orientation tests).
   */
  async listFilenames(pattern?: RegExp): Promise<string[]> {
    const index = await this.buildIndex();
    const names = Array.from(index.keys());
    return pattern ? names.filter((n) => pattern.test(n)) : names;
  }

  /** Convert a downloaded image buffer to a data URL for browser tests. */
  bufferToDataUrl(buffer: Buffer, filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      tiff: "image/tiff",
      tif: "image/tiff",
      heic: "image/heic",
    };
    const mime = mimeTypes[ext] || "application/octet-stream";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  /** Clean up the request context. Call in afterAll if needed. */
  async dispose(): Promise<void> {
    if (this.ctx) {
      await this.ctx.dispose();
      this.ctx = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton for sharing across tests in the same worker
// ---------------------------------------------------------------------------

let _instance: GalleryImages | null = null;

/** Get a shared GalleryImages instance (one per worker process). */
export function getGalleryImages(): GalleryImages {
  if (!_instance) {
    _instance = new GalleryImages();
  }
  return _instance;
}
