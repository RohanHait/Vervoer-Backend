import { Router } from "express";
import {bookASlot, deleteParking, editParkingLot, 
    getAvailableSpace, getListOfParkingLot, getParkingLotbyId,
    registerParkingLot} from "../controllers/merchant.parkinglot.controller.js"
import { imageUpload } from "../middleware/upload.middleware.js";
import { bookGarageSlot, checkoutGarageSlot, deleteGarage, 
    editGarage, getAvailableGarageSlots, getGarageDetails, 
    getListOfGarage, registerGarage } from "../controllers/merchant.garage.controller.js";
import { addResidence, deleteResidence, getListOfResidence, getResidenceById, updateResidence } from "../controllers/merchant.residence.controller.js";
import {imageUploadFields} from "../middleware/upload.middleware.js";

const merchantRouter = Router() ;

merchantRouter.post("/parkinglot/registration",imageUpload.array("images",10) ,registerParkingLot);
merchantRouter.put("/parkinglot/update/:id",imageUpload.array("images",10) ,editParkingLot);
merchantRouter.delete("/parkinglot/delete/:id",deleteParking);
merchantRouter.get("/parkinglot/getavailable" ,getAvailableSpace);
merchantRouter.post("/parkinglot/book", imageUploadFields,bookASlot);
merchantRouter.get("/parkinglot/search",getListOfParkingLot) ;
merchantRouter.get("/parkinglot/:id",getParkingLotbyId);

merchantRouter.post("/garage/registration",imageUpload.array("images", 10), registerGarage) ;
merchantRouter.put("/garage/update/:id",imageUpload.array("images", 10), editGarage) ;
merchantRouter.delete("/garage/delete/:id",deleteGarage) ;
merchantRouter.get("/garage/getavailable",getAvailableGarageSlots) ;
merchantRouter.post("/garage/book",imageUploadFields, bookGarageSlot) ;
merchantRouter.get("/garage/search", getListOfGarage) ;
merchantRouter.get("/garage/:id", getGarageDetails) ;
merchantRouter.post("/garage/checkout",checkoutGarageSlot) ;

merchantRouter.post("/residence/registration", imageUpload.array("images",10), addResidence);
merchantRouter.put("/residence/update/:id",imageUpload.array("images",10),updateResidence);
merchantRouter.delete("/residence/delete/:id",deleteResidence) ;
merchantRouter.get("/residence/search",getListOfResidence) ;
merchantRouter.get("/residence/:id",getResidenceById) ;

export default merchantRouter ;