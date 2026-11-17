export const alisConfig = Object.freeze({
  "productSlug": "brandon-rv",
  "componentSlug": "brandon-rv",
  "installationId": "258ca254-b441-4ca7-b9ac-9fd53ee5ca1b",
  "moduleVersion": "1.0.1",
  "productVersion": "0.1.0",
  "website": {
    "name": "BrandonRV-V2",
    "repository": "remipetrovich-design/BrandonRV-V2",
    "branch": "Dev-Test",
    "commit": "d8d33d55c812b9e87ff661c57b295a724380e3b5",
    "framework": "next",
    "productVersion": "0.1.0"
  },
  "licenseManagementPath": "/license",
  "database": "supabase",
  "licenseStorageTable": "alis_installation_licenses",
  "permissionSystem": {
    "kind": "custom-session-global-roles",
    "authImport": "@/lib/auth",
    "rolePolicyImport": "@/lib/user-role-policy",
    "currentUserFunction": "currentUser",
    "roleFunction": "isGlobalAdministrator",
    "userIdColumn": "id",
    "roleColumn": "user_role",
    "activeColumn": "status",
    "activeValue": "active",
    "ownerValues": [
      "ceo_founder",
      "website_development_specialist",
      "owner",
      "website_developer"
    ],
    "publicPaths": [
      "/portal/sign-in",
      "/setup",
      "/api/auth",
      "/api/alis/license",
      "/license"
    ]
  },
  "authority": "License Manager"
});
