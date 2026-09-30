// unzipper ships without types — declare the surface we use (zipExtract.ts).
declare module 'unzipper' {
  export interface ZipEntry {
    /** Path as recorded in the archive (may contain traversal segments). */
    path: string;
    type: 'File' | 'Directory';
    /** Uncompressed size from the central directory (bytes). */
    uncompressedSize: number;
    /** Full entry content, decompressed. */
    buffer(): Promise<Buffer>;
  }

  export interface CentralDirectory {
    files: ZipEntry[];
  }

  export const Open: {
    /** Parse a zip from a complete in-memory buffer. */
    buffer(data: Buffer): Promise<CentralDirectory>;
  };
}
