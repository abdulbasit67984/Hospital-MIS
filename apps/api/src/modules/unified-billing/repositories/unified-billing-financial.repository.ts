import { Decimal128, ObjectId, type ClientSession, type Db, type Document, type Filter } from 'mongodb';
const id=(value:string)=>new ObjectId(value); const dec=(v:string)=>Decimal128.fromString(v);
export class UnifiedBillingFinancialRepository {
  public constructor(private readonly db:Db) {}
  public approvals(){return this.db.collection('financialApprovalRequests');}
  public payments(){return this.db.collection('payments');}
  public allocations(){return this.db.collection('paymentAllocations');}
  public refunds(){return this.db.collection('refunds');}
  public ledger(){return this.db.collection('financialLedgerEntries');}
  public async findByOperation(collection:string,facilityId:string,operationKey:string,session:ClientSession){return this.db.collection(collection).findOne({facilityId:id(facilityId),operationKey},{session});}
  public async insertApproval(doc:Document,session:ClientSession){await this.approvals().insertOne(doc,{session});}
  public async decideApproval(facilityId:string,approvalId:string,version:number,update:Document,session:ClientSession){return this.approvals().findOneAndUpdate({_id:id(approvalId),facilityId:id(facilityId),version,status:'PENDING'},{$set:update,$inc:{version:1}},{session,returnDocument:'after'});}
  public async insertPayment(doc:Document,allocations:readonly Document[],session:ClientSession){await this.payments().insertOne(doc,{session}); if(allocations.length) await this.allocations().insertMany(allocations,{session});}
  public async insertRefund(doc:Document,session:ClientSession){await this.refunds().insertOne(doc,{session});}
  public async insertLedger(entries:readonly Document[],session:ClientSession){if(entries.length) await this.ledger().insertMany(entries,{session,ordered:true});}
  public async updateInvoiceBalance(facilityId:string,invoiceId:string,amount:string,session:ClientSession){return this.db.collection('invoices').findOneAndUpdate({_id:id(invoiceId),facilityId:id(facilityId),status:{$in:['FINALIZED','PARTIALLY_PAID','PAID']}},{$inc:{appliedPaymentAmount:dec(amount),outstandingAmount:dec('-'+amount),version:1},$set:{updatedAt:new Date()}},{session,returnDocument:'after'});}
  public async updateAccountBalance(facilityId:string,accountId:string,amount:string,session:ClientSession){return this.db.collection('patientAccounts').findOneAndUpdate({_id:id(accountId),facilityId:id(facilityId)},{$inc:{paymentAmount:dec(amount),outstandingBalance:dec('-'+amount),version:1},$set:{updatedAt:new Date()}},{session,returnDocument:'after'});}
  public async aggregate(collection:string,pipeline:Document[]){return this.db.collection(collection).aggregate(pipeline).toArray();}
  public async find(collection:string,filter:Filter<Document>,skip:number,limit:number){return this.db.collection(collection).find(filter).skip(skip).limit(limit).toArray();}
}