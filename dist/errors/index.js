export class ApplicationError extends Error {
    baseName = "ApplicationError";
    code = 500;
    constructor(message) {
        super(message);
        this.name = "ApplicationError";
    }
    getResponseMessage = () => {
        return {
            message: this.message,
        };
    };
    static isApplicationError = (error) => {
        return (error instanceof ApplicationError || error.baseName === "ApplicationError");
    };
}
