import type {Router} from 'express';
import type {AuthenticationService} from '../auth/auth.service.js';
import type {AuthorizationService} from '../authorization/authorization.service.js';
import type {PanelsPackagesCoverageApplication} from './panels-packages-coverage.application.js';
import {createPanelsPackagesCoverageRouter} from './panels-packages-coverage.routes.js';
export function createPanelsPackagesCoverageModule(options:{application:PanelsPackagesCoverageApplication;authenticationService:AuthenticationService;authorizationService:AuthorizationService}):{application:PanelsPackagesCoverageApplication;router:Router}{
 return {application:options.application,router:createPanelsPackagesCoverageRouter(options)};
}