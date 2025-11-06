"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorMiddleware = void 0;
var http_exception_1 = require("hono/http-exception");
var index_js_1 = require("../errors/index.js");
var env_js_1 = require("../env.js");
var globalErrorMiddleware = function (err, c) {
    if (err instanceof http_exception_1.HTTPException && err.message) {
        return c.json({
            message: err.message,
        }, err.status);
    }
    if (index_js_1.ApplicationError.isApplicationError(err)) {
        return c.json(err.getResponseMessage(), err.code);
    }
    console.error("APP ERROR:", err);
    if (env_js_1.env.NODE_ENV == "PRODUCTION")
        err.message = "Something went wrong, please try again later!";
    return c.json({ message: err.message }, 500);
};
exports.globalErrorMiddleware = globalErrorMiddleware;
