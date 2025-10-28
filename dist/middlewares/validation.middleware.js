import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
export const requestValidator = (target, schema, hook) => 
//   @ts-expect-error not typed well
validator(target, async (value, c) => {
    const result = await schema.safeParseAsync(value);
    if (hook) {
        const hookResult = await hook({ data: value, ...result }, c);
        if (hookResult) {
            if (hookResult instanceof Response) {
                return hookResult;
            }
            if ("response" in hookResult) {
                return hookResult.response;
            }
        }
    }
    if (!result.success) {
        throw new HTTPException(400, {
            message: `${result.error.errors[0]?.message} field '${result.error.errors[0]?.path}' on ${target}`,
        });
    }
    return result.data;
});
