/**
 * SmugMug API v2 client for test automation.
 *
 * Handles authenticated and unauthenticated API calls, image uploads,
 * and convenience methods for fetching image data, size tiers, and metadata.
 *
 * Usage:
 *   const api = new SmugMugAPI(page);        // uses browser session cookies
 *   const api = SmugMugAPI.withApiKey(key);   // unauthenticated public access
 */

import { type Page, type APIRequestContext, request } from "@playwright/test";
import * as fs from "fs";
import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageSizeTier {
  name: string; // e.g. 'TinyImageUrl', 'LargeImageUrl'
  label: string; // e.g. 'Ti', 'Th', 'S', 'M', 'L', 'XL'
  url: string;
  width: number;
  height: number;
  ext: string;
}

export interface ImageFields {
  ImageKey: string;
  Title: string;
  Caption: string;
  FileName: string;
  Format: string;
  OriginalWidth: number;
  OriginalHeight: number;
  OriginalSize: number;
  Latitude: number;
  Longitude: number;
  Altitude: number;
  Hidden: boolean;
  Watermark: boolean;
  KeywordArray: string[];
  ArchivedUri: string;
  ArchivedMD5: string;
  ArchivedSize: number;
  WebUri: string;
  Uris: Record<string, { Uri: string }>;
}

export interface UploadResult {
  ImageUri: string;
  URL: string;
}

// ---------------------------------------------------------------------------
// Size tier label mapping
// ---------------------------------------------------------------------------

const SIZE_TIER_LABELS: Record<string, string> = {
  TinyImageUrl: "Ti",
  ThumbnailImageUrl: "Th",
  SmallImageUrl: "S",
  MediumImageUrl: "M",
  LargeImageUrl: "L",
  XLargeImageUrl: "XL",
  X2LargeImageUrl: "X2L",
  X3LargeImageUrl: "X3L",
  X4LargeImageUrl: "X4L",
  X5LargeImageUrl: "X5L",
  OriginalImageUrl: "O",
  // Alternative key format returned by !sizedetails
  ImageSizeTiny: "Ti",
  ImageSizeThumb: "Th",
  ImageSizeSmall: "S",
  ImageSizeMedium: "M",
  ImageSizeLarge: "L",
  ImageSizeXLarge: "XL",
  ImageSizeX2Large: "X2L",
  ImageSizeX3Large: "X3L",
  ImageSizeX4Large: "X4L",
  ImageSizeX5Large: "X5L",
  ImageSize4K: "4K",
  ImageSize5K: "5K",
  ImageSizeOriginal: "O",
};

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class SmugMugAPI {
  private baseUrl: string;
  private requestContext: APIRequestContext | null = null;
  private page: Page | null = null;
  private apiKey: string | null = null;
  private csrfToken: string | null = null;

  /** The API key used for authenticated session requests (loaded from env vars). */
  static get SESSION_API_KEY(): string {
    const env = process.env.ENVIRONMENT || "inside";
    const key =
      env === "production"
        ? process.env.SMUGMUG_API_KEY_PRODUCTION
        : process.env.SMUGMUG_API_KEY_INSIDE;
    if (!key) {
      throw new Error(
        `SMUGMUG_API_KEY_${env.toUpperCase()} must be set in .env.`,
      );
    }
    return key;
  }

  constructor(page: Page, baseUrl?: string) {
    this.page = page;
    this.baseUrl =
      baseUrl ||
      (process.env.ENVIRONMENT === "production"
        ? "https://www.smugmug.com"
        : "https://inside.smugmug.net");
  }

  /** Create an unauthenticated client using just an API key. */
  static withApiKey(apiKey: string, baseUrl?: string): SmugMugAPI {
    const api = new SmugMugAPI(null as any, baseUrl);
    api.apiKey = apiKey;
    api.page = null;
    return api;
  }

  // -------------------------------------------------------------------------
  // Core request helpers
  // -------------------------------------------------------------------------

  private async getRequestContext(): Promise<APIRequestContext> {
    if (this.page) return this.page.request;
    if (!this.requestContext) {
      this.requestContext = await request.newContext({
        baseURL: this.baseUrl,
      });
    }
    return this.requestContext;
  }

  private appendApiKey(url: string): string {
    if (!this.apiKey) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}APIKey=${this.apiKey}`;
  }

  /** Append the session API key to a URL (for browser-session authenticated requests). */
  private appendSessionApiKey(url: string): string {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}APIKey=${SmugMugAPI.SESSION_API_KEY}`;
  }

  /** Fetch a CSRF token from the API. Required for write operations with session auth. */
  private async getCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const ctx = await this.getRequestContext();
    const url = `${this.baseUrl}/api/v2!token?APIKey=${SmugMugAPI.SESSION_API_KEY}`;
    const res = await ctx.post(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok()) {
      throw new Error(
        `Failed to get CSRF token: ${res.status()} ${await res.text()}`,
      );
    }
    const json = await res.json();
    this.csrfToken = json.Response.Token.Token;
    console.log(`[api] CSRF token acquired`);
    return this.csrfToken!;
  }

  /** GET a SmugMug API endpoint. Returns parsed JSON. */
  async get(uri: string, params?: Record<string, string>): Promise<any> {
    const ctx = await this.getRequestContext();
    let url = `${this.baseUrl}${uri}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }
    url = this.appendApiKey(url);
    const res = await ctx.get(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok()) {
      throw new Error(
        `API GET ${uri} returned ${res.status()}: ${await res.text()}`,
      );
    }
    return res.json();
  }

  /** PATCH a SmugMug API endpoint. Returns parsed JSON. */
  async patch(uri: string, body: Record<string, any>): Promise<any> {
    const ctx = await this.getRequestContext();
    let url = this.appendApiKey(`${this.baseUrl}${uri}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // For session-based auth, include API key and CSRF token
    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(`${this.baseUrl}${uri}`);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    }

    const res = await ctx.patch(url, { headers, data: body });
    if (!res.ok()) {
      throw new Error(
        `API PATCH ${uri} returned ${res.status()}: ${await res.text()}`,
      );
    }
    return res.json();
  }

  /** POST to a SmugMug API endpoint. Returns parsed JSON. */
  async post(uri: string, body: Record<string, any>): Promise<any> {
    const ctx = await this.getRequestContext();
    let url = this.appendApiKey(`${this.baseUrl}${uri}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(`${this.baseUrl}${uri}`);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    }

    const res = await ctx.post(url, { headers, data: body });
    if (!res.ok()) {
      throw new Error(
        `API POST ${uri} returned ${res.status()}: ${await res.text()}`,
      );
    }
    return res.json();
  }

  /** PUT to a SmugMug API endpoint. Returns parsed JSON. */
  async put(uri: string, body: Record<string, any>): Promise<any> {
    const ctx = await this.getRequestContext();
    let url = this.appendApiKey(`${this.baseUrl}${uri}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(`${this.baseUrl}${uri}`);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    }

    const res = await ctx.put(url, { headers, data: body });
    if (!res.ok()) {
      throw new Error(
        `API PUT ${uri} returned ${res.status()}: ${await res.text()}`,
      );
    }
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Image endpoints
  // -------------------------------------------------------------------------

  /** Fetch image fields from /api/v2/image/{imageKey}-0 */
  async getImage(imageKey: string): Promise<ImageFields> {
    const data = await this.get(`/api/v2/image/${imageKey}-0`);
    return data.Response.Image;
  }

  /** Fetch all size tiers with dimensions and URLs from !sizedetails */
  async getSizeDetails(imageKey: string): Promise<ImageSizeTier[]> {
    const data = await this.get(`/api/v2/image/${imageKey}-0!sizedetails`);
    const sizes = data.Response.ImageSizeDetails;
    const tiers: ImageSizeTier[] = [];

    for (const [key, value] of Object.entries(sizes)) {
      // Match both formats: "XLargeImageUrl" and "ImageSizeXLarge"
      if (
        (key.endsWith("ImageUrl") || key.startsWith("ImageSize")) &&
        typeof value === "object" &&
        value !== null
      ) {
        const v = value as any;
        if (v.Url) {
          tiers.push({
            name: key,
            label: SIZE_TIER_LABELS[key] || key,
            url: v.Url,
            width: v.Width || 0,
            height: v.Height || 0,
            ext: v.Ext || "jpg",
          });
        }
      }
    }
    return tiers;
  }

  /**
   * Wait for size tiers to be generated after upload.
   * Triggers tier generation by navigating to the image in the organize view,
   * then polls !sizedetails until at least `minTiers` tiers are available.
   */
  async waitForSizeTiers(
    imageKey: string,
    minTiers = 3,
    timeoutMs = 60_000,
    intervalMs = 3_000,
  ): Promise<ImageSizeTier[]> {
    // Trigger tier generation by loading the image page in a full browser
    // (SmugMug generates size tiers on demand when the page is viewed)
    if (this.page) {
      try {
        const image = await this.getImage(imageKey);
        if (image.WebUri) {
          const webUrl = image.WebUri.startsWith("http")
            ? image.WebUri
            : `${this.baseUrl}${image.WebUri}`;
          console.log(`[waitForSizeTiers] Triggering generation via ${webUrl}`);
          const browser = this.page.context().browser();
          if (browser) {
            const opts: any = {};
            if (this.baseUrl.includes("inside")) {
              opts.httpCredentials = {
                username: process.env.INSIDE_AUTH_USER || "",
                password: process.env.INSIDE_AUTH_PASS || "",
              };
            }
            const triggerCtx = await browser.newContext(opts);
            // Restore login cookies
            const authPath = require("path").resolve(
              __dirname,
              "../fixtures/auth-state.json",
            );
            try {
              const state = JSON.parse(
                require("fs").readFileSync(authPath, "utf8"),
              );
              if (state.cookies?.length) {
                await triggerCtx.addCookies(state.cookies);
              }
            } catch {}
            const triggerPage = await triggerCtx.newPage();
            const triggerResp = await triggerPage
              .goto(webUrl, { waitUntil: "networkidle", timeout: 30_000 })
              .catch((e: any) => {
                console.log(
                  `[waitForSizeTiers] Trigger page error: ${e.message}`,
                );
                return null;
              });
            console.log(
              `[waitForSizeTiers] Trigger page status: ${triggerResp?.status()}, url: ${triggerPage.url()}`,
            );
            // Wait for the image to fully load and tiers to register
            await triggerPage.waitForTimeout(5000);
            await triggerPage.close();
            await triggerCtx.close();
          }
        }
      } catch {
        // Ignore errors — this is just to trigger processing
      }
    }

    const start = Date.now();
    let tiers: ImageSizeTier[] = [];
    while (Date.now() - start < timeoutMs) {
      tiers = await this.getSizeDetails(imageKey);
      if (tiers.length >= minTiers) return tiers;
      console.log(
        `[waitForSizeTiers] ${imageKey}: ${tiers.length} tiers, waiting...`,
      );
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    console.log(
      `[waitForSizeTiers] ${imageKey}: timeout after ${timeoutMs}ms with ${tiers.length} tiers`,
    );
    return tiers;
  }

  /** Fetch the largest available image URL */
  async getLargestImage(
    imageKey: string,
  ): Promise<{ url: string; width: number; height: number }> {
    const data = await this.get(`/api/v2/image/${imageKey}-0!largestimage`);
    const img = data.Response.LargestImage;
    return { url: img.Url, width: img.Width, height: img.Height };
  }

  /** Fetch EXIF/IPTC metadata from !metadata */
  async getMetadata(imageKey: string): Promise<Record<string, any>> {
    const data = await this.get(`/api/v2/image/${imageKey}-0!metadata`);
    return data.Response.ImageMetadata;
  }

  /** Fetch Point of Interest */
  async getPointOfInterest(
    imageKey: string,
  ): Promise<{ x: number; y: number } | null> {
    try {
      const data = await this.get(
        `/api/v2/image/${imageKey}-0!pointofinterest`,
      );
      const poi = data.Response.PointOfInterest;
      if (!poi || poi.X === undefined || poi.Y === undefined) return null;
      return { x: poi.X, y: poi.Y };
    } catch {
      return null;
    }
  }

  /** Set Point of Interest */
  async setPointOfInterest(
    imageKey: string,
    x: number,
    y: number,
  ): Promise<void> {
    await this.patch(`/api/v2/image/${imageKey}-0`, {
      PointOfInterestX: x,
      PointOfInterestY: y,
    });
  }

  /** Fetch face/object regions */
  async getRegions(imageKey: string): Promise<any[]> {
    const data = await this.get(`/api/v2/image/${imageKey}-0!regions`);
    return data.Response.ImageRegion || [];
  }

  // -------------------------------------------------------------------------
  // Album endpoints
  // -------------------------------------------------------------------------

  /** Create a new folder under the user's root. Returns the folder URI and path. */
  async createFolder(
    nickname: string,
    name: string,
    options?: {
      urlName?: string;
      privacy?: "Public" | "Unlisted" | "Private";
    },
  ): Promise<{ folderUri: string; folderPath: string }> {
    const ctx = await this.getRequestContext();
    const urlName =
      options?.urlName ||
      name.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
    const body: Record<string, any> = {
      Name: name,
      UrlName: urlName,
      Privacy: options?.privacy || "Unlisted",
    };

    let url = `${this.baseUrl}/api/v2/folder/user/${nickname}!folders`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(url);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    } else {
      url = this.appendApiKey(url);
    }

    console.log(`[createFolder] POST ${url} with name="${name}"`);
    const res = await ctx.post(url, { headers, data: body });

    if (!res.ok()) {
      throw new Error(
        `Folder creation failed with ${res.status()}: ${await res.text()}`,
      );
    }

    const json = await res.json();
    const folder = json.Response?.Folder || json.Folder;
    if (!folder) {
      throw new Error(
        `Folder creation succeeded but response has no Folder field. Response: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    console.log(
      `[createFolder] Folder URI: ${folder.Uri}, UrlPath: ${folder.UrlPath}`,
    );
    return {
      folderUri: folder.Uri,
      folderPath:
        folder.Uri?.replace(/^\/api\/v2\/folder/, "") ||
        `/user/${nickname}/${urlName}`,
    };
  }

  /**
   * Create a new album inside a folder.
   * folderPath is the URL path portion, e.g. "/user/nickname/My-Folder"
   */
  async createAlbumInFolder(
    folderPath: string,
    title: string,
    options?: {
      urlName?: string;
      privacy?: "Public" | "Unlisted" | "Private";
    },
  ): Promise<{ albumUri: string; albumKey: string }> {
    const ctx = await this.getRequestContext();
    const body: Record<string, any> = {
      Name: title,
      UrlName:
        options?.urlName ||
        title
          .replace(/[^a-zA-Z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-/, "")
          .replace(/-$/, "")
          .replace(/^(.)/, (c) => c.toUpperCase())
          .slice(0, 60),
      Privacy: options?.privacy || "Unlisted",
    };

    let url = `${this.baseUrl}/api/v2/folder${folderPath}!albums`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(url);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    } else {
      url = this.appendApiKey(url);
    }

    console.log(`[createAlbumInFolder] POST with title="${title}"`);
    const res = await ctx.post(url, { headers, data: body });

    if (!res.ok()) {
      throw new Error(
        `Album creation failed with ${res.status()}: ${await res.text()}`,
      );
    }

    const json = await res.json();
    const album = json.Response?.Album || json.Album;
    if (!album) {
      throw new Error(
        `Album creation succeeded but response has no Album field. Response: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return {
      albumUri: album.Uri,
      albumKey: album.AlbumKey || album.Key,
    };
  }

  /** Create a new album under the user's root folder. Returns the album URI and key. */
  async createAlbum(
    nickname: string,
    title: string,
    options?: {
      urlName?: string;
      privacy?: "Public" | "Unlisted" | "Private";
    },
  ): Promise<{ albumUri: string; albumKey: string }> {
    const ctx = await this.getRequestContext();
    const body: Record<string, any> = {
      Name: title,
      UrlName: title.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-"),
      Privacy: options?.privacy || "Unlisted",
    };
    if (options?.urlName) body.UrlName = options.urlName;

    let url = `${this.baseUrl}/api/v2/folder/user/${nickname}!albums`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // For session-based auth, include API key and CSRF token
    if (this.page && !this.apiKey) {
      url = this.appendSessionApiKey(url);
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    } else {
      url = this.appendApiKey(url);
    }

    console.log(`[createAlbum] POST ${url} with title="${title}"`);
    const res = await ctx.post(url, { headers, data: body });

    if (!res.ok()) {
      throw new Error(
        `Album creation failed with ${res.status()}: ${await res.text()}`,
      );
    }

    const json = await res.json();
    const album = json.Response?.Album || json.Album;
    if (!album) {
      throw new Error(
        `Album creation succeeded but response has no Album field. Response: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return {
      albumUri: album.Uri,
      albumKey: album.AlbumKey || album.Key,
    };
  }

  /** List images in an album (paginated) */
  async getAlbumImages(
    albumKey: string,
    start = 1,
    count = 200,
  ): Promise<{ images: ImageFields[]; total: number }> {
    const data = await this.get(`/api/v2/album/${albumKey}!images`, {
      start: String(start),
      count: String(count),
    });
    return {
      images: data.Response.AlbumImage || [],
      total: data.Response.Pages?.Total || 0,
    };
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  /** Upload a file to a SmugMug album. Returns the image URI and public URL. */
  async uploadImage(
    filePath: string,
    albumUri: string,
    options?: {
      title?: string;
      caption?: string;
      keywords?: string;
      hidden?: boolean;
      replaceImageUri?: string;
    },
  ): Promise<UploadResult> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = filePath.split("/").pop() || "image.jpg";
    return this.uploadBuffer(fileBuffer, fileName, albumUri, options);
  }

  /** Upload a Buffer to a SmugMug album. Returns the image URI and public URL. */
  async uploadBuffer(
    fileBuffer: Buffer,
    fileName: string,
    albumUri: string,
    options?: {
      title?: string;
      caption?: string;
      keywords?: string;
      hidden?: boolean;
      replaceImageUri?: string;
    },
  ): Promise<UploadResult> {
    const md5 = crypto.createHash("md5").update(fileBuffer).digest("base64");

    // Determine MIME type from extension
    const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      heic: "image/heic",
      tiff: "image/tiff",
      tif: "image/tiff",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Length": String(fileBuffer.length),
      "Content-MD5": md5,
      "Content-Type": contentType,
      "X-Smug-AlbumUri": albumUri,
      "X-Smug-Version": "v2",
      "X-Smug-FileName": fileName,
      "X-Smug-ResponseType": "JSON",
    };

    if (options?.title) headers["X-Smug-Title"] = options.title;
    if (options?.caption) headers["X-Smug-Caption"] = options.caption;
    if (options?.keywords) headers["X-Smug-Keywords"] = options.keywords;
    if (options?.hidden !== undefined)
      headers["X-Smug-Hidden"] = String(options.hidden);
    if (options?.replaceImageUri)
      headers["X-Smug-ImageUri"] = options.replaceImageUri;

    // For session-based auth, include CSRF token
    if (this.page && !this.apiKey) {
      headers["X-CSRF-Token"] = await this.getCsrfToken();
    }

    const ctx = await this.getRequestContext();
    const uploadUrl = this.baseUrl.includes("inside")
      ? "https://upload.inside.smugmug.net/"
      : "https://upload.smugmug.com/";
    console.log(
      `[uploadBuffer] POST ${uploadUrl} file="${fileName}" size=${fileBuffer.length} album="${albumUri}"`,
    );
    const res = await ctx.post(uploadUrl, {
      headers,
      data: fileBuffer,
    });

    if (!res.ok()) {
      throw new Error(
        `Upload failed with ${res.status()}: ${await res.text()}`,
      );
    }

    const json = await res.json();
    const image = json.Image || json.Response?.Image;
    if (!image) {
      throw new Error(
        `Upload succeeded but response has no Image field. Response: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return {
      ImageUri: image.ImageUri || image.Uri,
      URL: image.URL || image.WebUri || "",
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Extract image key from an image URI like /api/v2/album/xxx/image/yyy-0 */
  static extractImageKey(imageUri: string): string {
    const match = imageUri.match(/image\/([A-Za-z0-9_-]+)/);
    if (!match)
      throw new Error(`Cannot extract image key from URI: ${imageUri}`);
    return match[1].replace(/-\d+$/, "");
  }

  /** Download a file from a URL and return it as a Buffer */
  async downloadBuffer(url: string): Promise<Buffer> {
    if (this.page) {
      const browser = this.page.context().browser();
      if (browser) {
        // Use a dedicated browser context with cookies and HTTP Basic Auth
        // to download cross-domain images (photos.smugmug.com, photos.inside.smugmug.net)
        const opts: any = {};
        if (this.baseUrl.includes("inside")) {
          opts.httpCredentials = {
            username: process.env.INSIDE_AUTH_USER || "",
            password: process.env.INSIDE_AUTH_PASS || "",
          };
        }
        opts.acceptDownloads = true;
        const dlCtx = await browser.newContext(opts);
        // Restore login cookies for authenticated downloads
        try {
          const authPath = require("path").resolve(
            __dirname,
            "../fixtures/auth-state.json",
          );
          const state = JSON.parse(
            require("fs").readFileSync(authPath, "utf8"),
          );
          if (state.cookies?.length) {
            await dlCtx.addCookies(state.cookies);
          }
        } catch {}
        const dlPage = await dlCtx.newPage();
        const filename = new URL(url).pathname.split("/").pop() || "";

        // Some URLs (archived originals, GIFs) trigger a download instead of
        // rendering inline. Handle both cases: normal response or download event.
        try {
          const [response] = await Promise.all([
            dlPage.waitForResponse((r) => r.url().includes(filename), {
              timeout: 60_000,
            }),
            dlPage.goto(url, { waitUntil: "commit", timeout: 60_000 }),
          ]);
          const body = Buffer.from(await response.body());
          await dlPage.close();
          await dlCtx.close();
          if (!response.ok()) {
            throw new Error(`Download failed for ${url}: ${response.status()}`);
          }
          return body;
        } catch (err: any) {
          if (
            err.message?.includes("Download is starting") ||
            err.message?.includes("download")
          ) {
            // The URL triggered a file download — use the download event
            await dlPage.close();
            await dlCtx.close();

            // Re-create context and use download handling
            const dlCtx2 = await browser.newContext({
              ...opts,
              acceptDownloads: true,
            });
            try {
              const authPath = require("path").resolve(
                __dirname,
                "../fixtures/auth-state.json",
              );
              const state = JSON.parse(
                require("fs").readFileSync(authPath, "utf8"),
              );
              if (state.cookies?.length) {
                await dlCtx2.addCookies(state.cookies);
              }
            } catch {}
            const dlPage2 = await dlCtx2.newPage();
            const [download] = await Promise.all([
              dlPage2.waitForEvent("download", { timeout: 60_000 }),
              dlPage2.goto(url, { timeout: 60_000 }).catch(() => {}),
            ]);
            const filePath = await download.path();
            if (!filePath) {
              await dlPage2.close();
              await dlCtx2.close();
              throw new Error(`Download failed for ${url}: no file path`);
            }
            const body = require("fs").readFileSync(filePath);
            await dlPage2.close();
            await dlCtx2.close();
            return Buffer.from(body);
          }
          throw err;
        }
      }
    }

    const ctx = await this.getRequestContext();
    const res = await ctx.get(url);
    if (!res.ok()) {
      throw new Error(`Download failed for ${url}: ${res.status()}`);
    }
    return Buffer.from(await res.body());
  }
}
