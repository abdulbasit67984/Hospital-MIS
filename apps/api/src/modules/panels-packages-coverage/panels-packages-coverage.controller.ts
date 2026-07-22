import type {Request,RequestHandler,Response} from 'express';
import {ResourceNotFoundError,createApiSuccess} from '@hospital-mis/shared';
import type {AuthorizationService} from '../authorization/authorization.service.js';
import type {PanelsPackagesCoverageApplication} from './panels-packages-coverage.application.js';
import {ppcActorFromRequest,ppcIdempotencyKeyFromRequest,validatedPpcPart} from './panels-packages-coverage.http-contracts.js';

export class PanelsPackagesCoverageController{
 public constructor(private readonly application:PanelsPackagesCoverageApplication,private readonly authorization:AuthorizationService){}
 private parameter(request:Request,key:string):string{const value=validatedPpcPart<Record<string,string|undefined>>(request,'params')[key];if(value===undefined)throw new ResourceNotFoundError(`Route parameter ${key} is unavailable`);return value;}
 private body<T>(request:Request):T{return validatedPpcPart<T>(request,'body');}
 private send(request:Request,response:Response,status:number,result:unknown):void{response.status(status).json(createApiSuccess(result,request.correlationId));}
 private mutation(status:number,operation:(actor:Awaited<ReturnType<typeof ppcActorFromRequest>>,key:string,request:Request)=>Promise<unknown>):RequestHandler{return async(request,response,next)=>{try{this.send(request,response,status,await operation(await ppcActorFromRequest(request,this.authorization),ppcIdempotencyKeyFromRequest(request),request));}catch(error){next(error);}};}
 private read(operation:(actor:Awaited<ReturnType<typeof ppcActorFromRequest>>,request:Request)=>Promise<unknown>):RequestHandler{return async(request,response,next)=>{try{this.send(request,response,200,await operation(await ppcActorFromRequest(request,this.authorization),request));}catch(error){next(error);}};}
 public createPanel=this.mutation(201,(actor,key,request)=>this.application.services.panels.create(actor,key,this.body(request)));
 public createPayer=this.mutation(201,(actor,key,request)=>this.application.services.coverageMaster.createPayer(actor,key,this.body(request)));
 public createCoveragePlan=this.mutation(201,(actor,key,request)=>this.application.services.coverageMaster.createPlan(actor,key,this.body(request)));
 public enrollCoverage=this.mutation(201,(actor,key,request)=>this.application.services.coverageMaster.enrollPatient(actor,key,this.body(request)));
 public enrollPackage=this.mutation(201,(actor,key,request)=>this.application.services.packages.enroll(actor,key,this.body(request)));
 public reservePackage=this.mutation(201,(actor,_key,request)=>this.application.services.packages.reserveUtilization(actor,this.body<{expectedBalanceVersion:number}>(request).expectedBalanceVersion,this.body(request)));
 public reversePackage=this.mutation(200,(actor,key,request)=>this.application.services.packages.reverseUtilization(actor,this.parameter(request,'utilizationId'),key,this.body(request)));
 public verifyCoverage=this.mutation(200,(actor,key,request)=>this.application.services.verification.verify(actor,this.parameter(request,'coverageId'),key,this.body(request)));
 public estimateCoverage=this.read((actor,request)=>this.application.services.determinations.estimate(actor,this.body(request)));
 public determineCoverage=this.mutation(201,(actor,_key,request)=>this.application.services.determinations.determine(actor,this.body<{expectedInvoiceVersion:number}>(request).expectedInvoiceVersion,this.body(request)));
}