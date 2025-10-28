export declare class ApplicationError extends Error {
    baseName: string;
    code: number;
    constructor(message: string);
    getResponseMessage: () => {
        message: string;
    };
    static isApplicationError: (error: any) => error is ApplicationError;
}
//# sourceMappingURL=index.d.ts.map