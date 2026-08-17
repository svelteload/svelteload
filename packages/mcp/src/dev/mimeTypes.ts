const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',

  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/avi',
  mov: 'video/quicktime',

  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',

  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  txt: 'text/plain',
  md: 'text/markdown',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',

  json: 'application/json',
  xml: 'application/xml',
  js: 'application/javascript',
  css: 'text/css',
  html: 'text/html',
}

export function mimeTypeForFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext || ext === filename.toLowerCase()) return null
  return MIME_BY_EXTENSION[ext] ?? null
}

const KNOWN_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)
