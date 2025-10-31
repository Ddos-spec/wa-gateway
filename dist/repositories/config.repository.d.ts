export type ConfigRow = {
    id: number;
    username: string;
    password_hash: string;
    updated_at: Date | string;
};
export declare const findConfigByUsername: (username: string) => Promise<ConfigRow | null>;
//# sourceMappingURL=config.repository.d.ts.map