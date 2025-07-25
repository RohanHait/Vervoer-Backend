import { Router } from "express";
import {bookASlot, deleteParking, editParkingLot, 
    getAvailableSpace, getListOfParkingLot, getLotBookingById, getLotBookingList, getParkingLotbyId,
    lotCheckOut,
    registerParkingLot} from "../controllers/merchant.parkinglot.controller.js"
import { imageUpload } from "../middleware/upload.middleware.js";
import { bookGarageSlot, checkoutGarageSlot, deleteGarage, 
    editGarage, garageBookingInfo, garageBookingList, getAvailableGarageSlots, getGarageDetails, 
    getListOfGarage, registerGarage ,scanBookingQRCode} from "../controllers/merchant.garage.controller.js";
import { addResidence, deleteResidence, getListOfResidence, getResidenceById, updateResidence ,deleteResidenceBooking, verifyResidenceBooking, checkoutResidence, residenceBookingInfo, residenceBookingList} from "../controllers/merchant.residence.controller.js";
import {imageUploadFields} from "../middleware/upload.middleware.js";

const merchantRouter = Router() ;

merchantRouter.post("/parkinglot/registration",imageUpload.array("images",10) ,registerParkingLot);
merchantRouter.put("/parkinglot/update/:id",imageUpload.array("images",10) ,editParkingLot);
merchantRouter.delete("/parkinglot/delete/:id",deleteParking);
merchantRouter.get("/parkinglot/getavailable" ,getAvailableSpace);
merchantRouter.post("/parkinglot/checkout", lotCheckOut)
merchantRouter.post("/parkinglot/book", imageUploadFields,bookASlot);
merchantRouter.get("/parkinglot/booking", getLotBookingList)
merchantRouter.get("/parkinglot/booking/:id", getLotBookingById)
merchantRouter.get("/parkinglot/search",getListOfParkingLot) ;
merchantRouter.get("/parkinglot/:id",getParkingLotbyId);

merchantRouter.post("/garage/registration",imageUpload.array("images", 10), registerGarage) ;
merchantRouter.put("/garage/update/:id",imageUpload.array("images", 10), editGarage) ;
merchantRouter.delete("/garage/delete/:id",deleteGarage) ;
merchantRouter.get("/garage/getavailable",getAvailableGarageSlots) ;
merchantRouter.post("/garage/book",imageUploadFields, bookGarageSlot) ;
merchantRouter.get("/garage/search", getListOfGarage) ;
merchantRouter.post("/garage/checkout",checkoutGarageSlot) ;
merchantRouter.get("/garage/booking", garageBookingList);
merchantRouter.get("/garage/booking/:id", garageBookingInfo);
merchantRouter.get("/garage/:id", getGarageDetails) ;
merchantRouter.get('/api/garage-booking/scan/:id', scanBookingQRCode);


merchantRouter.post("/residence/registration", imageUpload.array("images",10), addResidence);
merchantRouter.put("/residence/update/:residenceId",imageUpload.array("images",10),updateResidence);
merchantRouter.delete("/residence/delete/:residenceId",deleteResidence) ;
merchantRouter.get("/residence/search",getListOfResidence) ;
merchantRouter.post("/residence/book", verifyResidenceBooking) ;
merchantRouter.post("/residence/checkout", checkoutResidence) ;
merchantRouter.get("/residence/booking", residenceBookingList);
merchantRouter.get("/residence/booking/:id",residenceBookingInfo);
merchantRouter.delete("/residence/booking/:bookingId", deleteResidenceBooking);
merchantRouter.get("/residence/:residenceId",getResidenceById) ;

export default merchantRouter ;