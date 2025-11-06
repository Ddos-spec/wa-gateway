"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundMiddleware = void 0;
var http_exception_1 = require("hono/http-exception");
var notFoundMiddleware = function (c) {
    throw new http_exception_1.HTTPException(404, {
        message: "Route not found",
    });
};
exports.notFoundMiddleware = notFoundMiddleware;
