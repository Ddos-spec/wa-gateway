"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationError = void 0;
var ApplicationError = /** @class */ (function (_super) {
    __extends(ApplicationError, _super);
    function ApplicationError(message) {
        var _this = _super.call(this, message) || this;
        _this.baseName = "ApplicationError";
        _this.code = 500;
        _this.getResponseMessage = function () {
            return {
                message: _this.message,
            };
        };
        _this.name = "ApplicationError";
        return _this;
    }
    ApplicationError.isApplicationError = function (error) {
        return (error instanceof ApplicationError || error.baseName === "ApplicationError");
    };
    return ApplicationError;
}(Error));
exports.ApplicationError = ApplicationError;
