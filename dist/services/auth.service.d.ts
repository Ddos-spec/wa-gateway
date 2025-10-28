export type AuthenticatedUser = {
    id: number;
    username: string;
    createdAt: string;
};
export type AuthResult = {
    token: string;
    user: AuthenticatedUser;
};
export declare const authenticateUser: (username: string, password: string) => Promise<AuthResult>;
//# sourceMappingURL=auth.service.d.ts.map