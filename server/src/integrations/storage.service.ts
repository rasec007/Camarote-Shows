import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? endpoint;
const credentials = { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" };
const internalClient = new S3Client({ region: process.env.S3_REGION ?? "us-east-1", endpoint, forcePathStyle: true, credentials });
const publicClient = publicEndpoint === endpoint ? internalClient : new S3Client({ region: process.env.S3_REGION ?? "us-east-1", endpoint: publicEndpoint, forcePathStyle: true, credentials });

export const bucketByContext = { contrato: "contratos", financeiro: "financeiro", rh: "rh", evento: "arquivos", geral: "arquivos" } as const;
export type FileContext = keyof typeof bucketByContext;

export async function savePrivateFile(input: { bytes: Buffer; filename: string; contentType: string; context: FileContext }) {
  const bucket = bucketByContext[input.context];
  const objectKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  await internalClient.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: input.bytes, ContentType: input.contentType, Metadata: { sha256 } }));
  return { bucket, objectKey, sha256 };
}

export async function removePrivateFile(bucket: string, objectKey: string) {
  await internalClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function signedDownload(bucket: string, objectKey: string, filename: string) {
  const safeName = filename.replace(/[\r\n"\\]/g, "_");
  return getSignedUrl(publicClient, new GetObjectCommand({
    Bucket: bucket, Key: objectKey, ResponseContentDisposition: `attachment; filename="${safeName}"`, ResponseCacheControl: "private, no-store",
  }), { expiresIn: 300 });
}
