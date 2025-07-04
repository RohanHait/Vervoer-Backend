import { LotRentRecordModel } from "../models/merchant.model.js"
export async function getRecordList(date : Date , ID : string){
    const bookingRecord = await LotRentRecordModel.find({
        $and :[
            {rentFrom : { $lt : date}},
            {rentTo : {$gt : date}} ,
            {lotDetails : ID}
        ]
    })
    return {date ,bookingRecord}
}
const PADDING = "000"
export function generateParkingSpaceID(zone : string , slot : string){
    return zone + " "+ PADDING.substring(0, PADDING.length - slot.length) + slot ;
}
export function getParkSpaceFromID(str : string){
    const res = str.match(/^([A-Z]+) (\d\d\d)$/) ;
    if(res == null) return null ;
    return {zone : res[1] , slot : res[2]} ;
}