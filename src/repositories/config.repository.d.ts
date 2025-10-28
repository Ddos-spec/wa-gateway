export type ConfigRow = {
    id: number;
    username: string;
    password: string;
    created_at: Date | string;
};
export declare const findConfigByUsername: (username: string) => Promise<ConfigRow | null>;
//# sourceMappingURL=config.repository.d.ts.map