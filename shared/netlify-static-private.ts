import {z} from 'zod';
import {staticPublishConfigurationSchema, staticPublishRecoveryConfigurationSchema} from './prototype-publish-operation.js';

export const PRIVATE_NETLIFY_ADAPTER = 'netlify_static_draft_v1';
export const privateNetlifyBootstrapSchema = z.object({
  version: z.literal('netlify-private-stdio-v1'),
  configuration: z.union([staticPublishConfigurationSchema, staticPublishRecoveryConfigurationSchema])
}).strict();
export const PRIVATE_NETLIFY_TOKEN_ENV = 'SLASH_PRIVATE_NETLIFY_TOKEN';

