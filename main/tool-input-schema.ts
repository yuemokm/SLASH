import {Type} from '@sinclair/typebox';
import {z} from 'zod';

/** Tool arguments describe the pre-parse input, not Zod's default-filled output.
 * Execution must still parse with the original schema and host guards. */
export function toolInputSchema(schema:z.ZodType){
 return Type.Unsafe(z.toJSONSchema(schema,{io:'input'}));
}
