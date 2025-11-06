"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhookMessage = void 0;
var media_js_1 = require("./media.js");
var createWebhookMessage = function (message) { return __awaiter(void 0, void 0, void 0, function () {
    var image, video, document, audio, body;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    return __generator(this, function (_t) {
        switch (_t.label) {
            case 0:
                if (message.key.fromMe || ((_a = message.key.remoteJid) === null || _a === void 0 ? void 0 : _a.includes("broadcast"))) {
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, media_js_1.handleWebhookImageMessage)(message)];
            case 1:
                image = _t.sent();
                return [4 /*yield*/, (0, media_js_1.handleWebhookVideoMessage)(message)];
            case 2:
                video = _t.sent();
                return [4 /*yield*/, (0, media_js_1.handleWebhookDocumentMessage)(message)];
            case 3:
                document = _t.sent();
                return [4 /*yield*/, (0, media_js_1.handleWebhookAudioMessage)(message)];
            case 4:
                audio = _t.sent();
                body = {
                    session: message.sessionId,
                    from: (_b = message.key.remoteJid) !== null && _b !== void 0 ? _b : null,
                    message: ((_c = message.message) === null || _c === void 0 ? void 0 : _c.conversation) ||
                        ((_e = (_d = message.message) === null || _d === void 0 ? void 0 : _d.extendedTextMessage) === null || _e === void 0 ? void 0 : _e.text) ||
                        ((_g = (_f = message.message) === null || _f === void 0 ? void 0 : _f.imageMessage) === null || _g === void 0 ? void 0 : _g.caption) ||
                        ((_j = (_h = message.message) === null || _h === void 0 ? void 0 : _h.videoMessage) === null || _j === void 0 ? void 0 : _j.caption) ||
                        ((_l = (_k = message.message) === null || _k === void 0 ? void 0 : _k.documentMessage) === null || _l === void 0 ? void 0 : _l.caption) ||
                        ((_o = (_m = message.message) === null || _m === void 0 ? void 0 : _m.contactMessage) === null || _o === void 0 ? void 0 : _o.displayName) ||
                        ((_q = (_p = message.message) === null || _p === void 0 ? void 0 : _p.locationMessage) === null || _q === void 0 ? void 0 : _q.comment) ||
                        ((_s = (_r = message.message) === null || _r === void 0 ? void 0 : _r.liveLocationMessage) === null || _s === void 0 ? void 0 : _s.caption) ||
                        null,
                    /**
                     * media message
                     */
                    media: {
                        image: image,
                        video: video,
                        document: document,
                        audio: audio,
                    },
                };
                return [2 /*return*/, body];
        }
    });
}); };
exports.createWebhookMessage = createWebhookMessage;
