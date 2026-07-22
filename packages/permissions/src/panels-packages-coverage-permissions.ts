export const panelsPackagesCoveragePermissionKeys=[
 'panels.read','panels.manage','panels.activate','packages.read','packages.manage','packages.activate','packages.enroll','packages.suspend','packages.cancel','packages.reverse',
 'coverage.read','coverage.manage','coverage.activate','coverage.enroll','coverage.verify','coverage.estimate','coverage.determine','coverage.override',
 'coverage.utilization.read','coverage.reports.read','coverage.reports.export',
] as const;
export type PanelsPackagesCoveragePermissionKey=(typeof panelsPackagesCoveragePermissionKeys)[number];
export const panelsPackagesCoverageHighlySensitivePermissions=new Set<PanelsPackagesCoveragePermissionKey>([
 'panels.activate','packages.activate','packages.cancel','packages.reverse','coverage.activate','coverage.override',
]);