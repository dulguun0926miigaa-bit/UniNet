import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { env } from '../config/env.js'
import { assertSafeStorageKey } from './file-policy.js'

const client = new S3Client({
  endpoint: env.fileStorage.endpoint,
  region: env.fileStorage.region,
  forcePathStyle: env.fileStorage.forcePathStyle,
  credentials: {
    accessKeyId: env.fileStorage.accessKey,
    secretAccessKey: env.fileStorage.secretKey,
  },
})

export const objectStorage = {
  async put(key, buffer, metadata = {}) {
    assertSafeStorageKey(key)
    await client.send(new PutObjectCommand({
      Bucket: env.fileStorage.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/octet-stream',
      CacheControl: 'no-store',
      Metadata: { classification: 'private', quarantine: 'true', ...(metadata.sha256 ? { sha256: metadata.sha256 } : {}) },
      ServerSideEncryption: 'AES256',
    }))
  },

  async promote(sourceKey, destinationKey, metadata = {}) {
    assertSafeStorageKey(sourceKey)
    assertSafeStorageKey(destinationKey)
    await client.send(new CopyObjectCommand({
      Bucket: env.fileStorage.bucket,
      CopySource: `${env.fileStorage.bucket}/${sourceKey}`,
      Key: destinationKey,
      ContentType: 'application/octet-stream',
      CacheControl: 'private, no-store',
      MetadataDirective: 'REPLACE',
      Metadata: { classification: 'private', quarantine: 'false', ...(metadata.sha256 ? { sha256: metadata.sha256 } : {}) },
      ServerSideEncryption: 'AES256',
    }))
    await this.delete(sourceKey)
  },

  async get(key) {
    assertSafeStorageKey(key)
    return client.send(new GetObjectCommand({ Bucket: env.fileStorage.bucket, Key: key }))
  },

  async delete(key) {
    assertSafeStorageKey(key)
    await client.send(new DeleteObjectCommand({ Bucket: env.fileStorage.bucket, Key: key }))
  },
}
