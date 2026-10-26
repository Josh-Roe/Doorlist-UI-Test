declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SESSION_ENCRYPTION_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
