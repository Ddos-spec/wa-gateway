"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookClient = void 0;
var axios_1 = require("axios");
var env_js_1 = require("../env.js");
exports.webhookClient = axios_1.default.create({
    headers: {
        key: env_js_1.env.KEY,
    },
});
