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

import { type Page, type APIRequestContext, request } from '@playwright/test';
import * as fs from 'fs';
import * as crypto from 'crypto';

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
  TinyImageUrl: 'Ti',
  ThumbnailImageUrl: 'Th',
  SmallImageUrl: 'S',
  MediumImageUrl: 'M',
  LargeImageUrl: 'L',
  XLargeImageUrl: 'XL',
  X2LargeImageUrl: 'X2L',
  X3LargeImageUrl: 'X3L',
  X4LargeImageUrl: 'X4L',
  X5LargeImageUrl: 'X5L',
  OriginalImageUrl: 'O',
};

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class SmugMugAPI {
  private baseUrl: string;
  private requestContext: APIRequestContext | null = null;
  private page: Page | null = null;
  private apiKey: string | null = null;

  constructor(page: Page, baseUrl?: string) {
    this.page = page;
    this.baseUrl =
      baseUrl ||
      (process.env.ENVIRONMENT === 'production'
        ? 'https://www.smugmug.com'
        : 'https://www.smugmug.com'); // Public browsing base
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
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}APIKey=${this.apiKey}`;
  }

  /** GET a SmugMug API endpoint. Returns parsed JSON. */
  async get(uri: string, params?: Record<string, string>): Promise<any> {
    const ctx = await this.getRequestContext();
    let url = `${this.baseUrl}${uri}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }
    url = this.appendApiKey(url);
    const res = await ctx.get(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok()) {
      throw new Error(`API GET ${uri} returned ${res.status()}: ${await res.text()}`);
    }
    return res.json();
  }

  /** PATCH a SmugMug API endpoint. Returns parsed JSON. */
  async patch(uri: string, body: Record<string, any>): Promise<any> {
    const ctx = await this.getRequestContext();
    const url = this.appendApiKey(`${this.baseUrl}${uri}`);
    const res = await ctx.patch(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      data: body,
    });
    if (!res.ok()) {
      throw new Error(`API PATCH ${uri} returned ${res.status()}: ${await res.text()}`);
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
      if (key.endsWith('ImageUrl') && typeof value === 'object' && value !== null) {
        const v = value as any;
        if (v.Url) {
          tiers.push({
            name: key,
            label: SIZE_TIER_LABELS[key] || key,
            url: v.Url,
            width: v.Width || 0,
            height: v.Height || 0,
            ext: v.Ext || 'jpg',
          });
        }
      }
    }
    return tiers;
  }

  /** Fetch the largest available image URL */
  async getLargestImage(imageKey: string): Promise<{ url: string; width: number; height: number }> {
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
  async getPointOfInterest(imageKey: string): Promise<{ x: number; y: number } | null> {
    try {
      const data = await this.get(`/api/v2/image/${imageKey}-0!pointofinterest`);
      const poi = data.Response.PointOfInterest;
      return poi ? { x: poi.X, y: poi.Y } : null;
    } catch {
      return null;
    }
  }

  /** Set Point of Interest */
  async setPointOfInterest(imageKey: string, x: number, y: number): Promise<void> {
    await this.patch(`/api/v2/image/${imageKey}-0!pointofinterest`, { X: x, Y: y });
  }

  /** Fetch face/object regions */
  async getRegions(imageKey: string): Promise<any[]> {
    const data = await this.get(`/api/v2/image/${imageKey}-0!regions`);
    return data.Response.ImageRegion || [];
  }

  // -------------------------------------------------------------------------
  // Album endpoints
  // -------------------------------------------------------------------------

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
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('base64');
    const fileName = filePath.split('/').pop() || 'image.jpg';

    // Determine MIME type from extension
    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      heic: 'image/heic',
      tiff: 'image/tiff',
      tif: 'image/tiff',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Length': String(fileBuffer.length),
      'Content-MD5': md5,
      'Content-Type': contentType,
      'X-Smug-AlbumUri': albumUri,
      'X-Smug-Version': 'v2',
      'X-Smug-FileName': fileName,
      'X-Smug-ResponseType': 'JSON',
    };

    if (options?.title) headers['X-Smug-Title'] = options.title;
    if (options?.caption) headers['X-Smug-Caption'] = options.caption;
    if (options?.keywords) headers['X-Smug-Keywords'] = options.keywords;
    if (options?.hidden !== undefined) headers['X-Smug-Hidden'] = String(options.hidden);
    if (options?.replaceImageUri) headers['X-Smug-ImageUri'] = options.replaceImageUri;

    const ctx = await this.getRequestContext();
    const res = await ctx.post('https://upload.smugmug.com/', {
      headers,
      data: fileBuffer,
    });

    if (!res.ok()) {
      throw new Error(`Upload failed with ${res.status()}: ${await res.text()}`);
    }

    const json = await res.json();
    return {
      ImageUri: json.Image.ImageUri,
      URL: json.Image.URL,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Extract image key from an image URI like /api/v2/album/xxx/image/yyy-0 */
  static extractImageKey(imageUri: string): string {
    const match = imageUri.match(/image\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error(`Cannot extract image key from URI: ${imageUri}`);
    return match[1].replace(/-\d+$/, '');
  }

  /** Download a file from a URL and return it as a Buffer */
  async downloadBuffer(url: string): Promise<Buffer> {
    const ctx = await this.getRequestContext();
    const res = await ctx.get(url);
    if (!res.ok()) {
      throw new Error(`Download failed for ${url}: ${res.status()}`);
    }
    return Buffer.from(await res.body());
  }
}
