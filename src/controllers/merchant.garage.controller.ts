import { Request, Response } from "express";
import { Garage, GarageBooking, IGarage } from "../models/merchant.garage.model.js";
import { ApiError } from "../utils/apierror.js";
import z from "zod/v4";
import { ApiResponse } from "../utils/apirespone.js";
import { asyncHandler } from "../utils/asynchandler.js";
import { verifyAuthentication } from "../middleware/verifyAuthhentication.js";
import mongoose from "mongoose";
import { generateParkingSpaceID } from "../utils/lotProcessData.js";
import uploadToCloudinary from "../utils/cloudinary.js";
import { IUser } from "../models/normalUser.model.js";

// Zod schemas for validation
const GarageData = z.object({
  garageName: z.string().min(1, "Garage name is required"),
  about: z.string().min(1, "About is required"),
  address: z.string().min(1, "Address is required"),
  price: z.coerce.number(),
  location: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.coerce.number().gte(-180).lte(180), z.coerce.number().gte(-90).lte(90)])
  }).optional(),
  images : z.array(z.url()).optional(),
  contactNumber: z.string().min(9, "Contact number is required"),
  email: z.email().optional(),
  generalAvailable: z.array(z.object({
    day: z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]),
    isOpen: z.coerce.boolean().default(true),
    openTime: z.string().optional(),
    closeTime: z.string().optional(),
    is24Hours: z.coerce.boolean().default(false)
  })),
  is24x7: z.coerce.boolean().default(false),
  emergencyContact: z.object({
    phone: z.string(),
    available: z.coerce.boolean()
  }).optional(),
  spacesList: z.record(z.string().regex(/^[A-Z]{1,3}$/),z.coerce.number().min(1).max(1000))
});

const CheckoutData = z.object({
  garageId: z.string(),
  bookedSlot: z.object({
    zone : z.string().regex(/^[A-Z]{1,3}$/),
    slot : z.coerce.number().max(1000).min(1)
  }),
  bookingPeriod: z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime()
  }),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CREDIT", "DEBIT", "UPI", "PAYPAL" ]).optional(),
  vehicleNumber: z.string().min(5).optional()
}).refine((data) => data.bookingPeriod.from < data.bookingPeriod.to, {
  message: "Booking period is invalid",
  path: ["bookingPeriod"],
});


const BookingData = z.object({
  transactionId: z.string(),
  paymentMethod: z.enum(["CASH", "CREDIT", "DEBIT", "UPI", "PAYPAL"]),
  bookingId : z.string(),
})
/**
 * Register a new garage
 */
export const registerGarage = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const rData = GarageData.parse(req.body);
      const verifiedAuth = await verifyAuthentication(req);
      
      if (verifiedAuth?.userType !== "merchant") {
        throw new ApiError(400, "INVALID_USER");
      }
      
      const owner = verifiedAuth.user;
      
      if (!owner) {
        throw new ApiError(400, "UNKNOWN_USER");
      }
      let imageURL:string[] = [] ;
      if(req.files){
        if(Array.isArray(req.files))
            imageURL = await Promise.all(req.files.map(
                (file)=>uploadToCloudinary(file.buffer))
            ).then(e=>e.map(e=>e.secure_url));
        else imageURL = await Promise.all(req.files.images.map(
                (file)=>uploadToCloudinary(file.buffer))
            ).then(e=>e.map(e=>e.secure_url));
      }

      const newGarage = await Garage.create({
        owner: owner._id,
        images: imageURL ,
        ...rData
      });

      // Update merchant's haveGarage status
      await mongoose.model("Merchant").findByIdAndUpdate(owner._id, {
        haveGarage: true
      });

      res.status(201).json(new ApiResponse(201, { garage: newGarage }));
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.log(err.issues)
        throw new ApiError(400, "DATA_VALIDATION_ERROR", err.issues);
      }
      throw err;
    }
  }
);

/**
 * Edit an existing garage
 */
export const editGarage = asyncHandler(async (req: Request, res: Response) => {
  try {
    const garageId = z.string().parse(req.params.id);
    const updateData = GarageData.partial().parse(req.body);
    const verifiedAuth = await verifyAuthentication(req);

    if (verifiedAuth?.userType !== "merchant" || !verifiedAuth?.user) {
      throw new ApiError(400, "UNAUTHORIZED");
    }

    // Find the garage and verify ownership
    const garage = await Garage.findById(garageId);
    if (!garage) {
      throw new ApiError(404, "GARAGE_NOT_FOUND");
    }

    if (garage.owner.toString() !== verifiedAuth.user._id?.toString()) {
      throw new ApiError(403, "UNAUTHORIZED_ACCESS");
    }

    // Update the garage with new data
    let imageURL:string[] = [] ;
      if(req.files){
        if(Array.isArray(req.files))
            imageURL = await Promise.all(req.files.map(
                (file)=>uploadToCloudinary(file.buffer))
            ).then(e=>e.map(e=>e.secure_url));
        else imageURL = await Promise.all(req.files.images.map(
                (file)=>uploadToCloudinary(file.buffer))
            ).then(e=>e.map(e=>e.secure_url));
      }
    if(imageURL.length > 0){
        updateData.images = [...garage.images, ...imageURL]
    }
    const updatedGarage = await Garage.findByIdAndUpdate(
      garageId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedGarage) {
      throw new ApiError(500, "FAILED_TO_UPDATE_GARAGE");
    }

    res.status(200).json(new ApiResponse(200, { garage: updatedGarage }));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ApiError(400, "DATA_VALIDATION_ERROR", err.issues);
    }
    throw err;
  }
});

/**
 * Get available slots for a garage
 */
export const getAvailableGarageSlots = asyncHandler(async (req: Request, res: Response) => {
  try {
    const startDate = z.iso.date().parse(req.query.startDate);
    const endDate = z.iso.date().parse(req.query.endDate);
    const garageId = z.string().parse(req.query.garageId);

    const garage = await Garage.findById(garageId);
    if (!garage) {
      console.log("ID:",garageId)
      throw new ApiError(400, "GARAGE_NOT_FOUND");
    }
    let totalSpace = 0 ;
    garage.spacesList?.forEach((e)=>{totalSpace+=e})
    // Get all bookings that overlap with the requested time period
    const bookings = await GarageBooking.find({
      garageId,
      $or: [
        {
          'bookingPeriod.from': { $lte: new Date(endDate) },
          'bookingPeriod.to': { $gte: new Date(startDate) }
        },
        {
          'bookingPeriod.from': { $gte: new Date(startDate), $lte: new Date(endDate) }
        },
        {
          'bookingPeriod.to': { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      ]
    }, "-customerId").exec();

    

    res.status(200).json(new ApiResponse(200, { 
      availableSpace: totalSpace - bookings.length,
      bookedSlot : bookings.map((e)=>({rentedSlot : e.bookedSlot, rentFrom : e.bookingPeriod?.from , rentTo : e.bookingPeriod?.to})) ,
      isOpen: garage.isOpenNow()
    }));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ApiError(400, "INVALID_QUERY", err.issues);
    }
    console.log(err) ;
    throw err;
  }
});

/**
 * Book a garage slot
 */

/**
 * Checkout and process payment for a parking booking
 */
export const checkoutGarageSlot = asyncHandler(async (req: Request, res: Response) => {
  try {
    console.log("new chekout request\nValidating Auth")
    const verifiedAuth = await verifyAuthentication(req);
    
    if (verifiedAuth?.userType !== "user" || !verifiedAuth?.user) {
      throw new ApiError(401, 'UNAUTHORIZED');
    }
    console.log("Validation Succesfull request user is", verifiedAuth.user._id )
    console.log("Validating req data")
    const rData = CheckoutData.parse(req.body);
    console.log("Validation Succesfull req data is", rData)
    console.log("Verifying garage")
    const garage = await Garage.findById(rData.garageId);
    if (!garage) {
      throw new ApiError(404, "GARAGE_NOT_FOUND");
    }
    console.log("Verifying garage is", garage)
    // Check if the slot exists in availableSlots
    const maxSlots = garage?.spacesList?.get(rData.bookedSlot.zone) || 0;
    console.log("Verifying slot id", rData.bookedSlot.slot)
    console.log("Maximum Slot: ",maxSlots)
    if (maxSlots <= 0 || rData.bookedSlot.slot > maxSlots) {
      throw new ApiError(400, "INVALID_SLOT");
    }
    // check Availability
    const bookedSlotId = generateParkingSpaceID(rData.bookedSlot.zone,rData.bookedSlot.slot.toString());
    console.log("cheking availability of slot")
    const isNotAvailableSlot = await GarageBooking.findOne({
      garageId: rData.garageId,
      bookedSlot: bookedSlotId,
      "paymentDetails.status": "SUCCESS",
      $or: [
        {
          'bookingPeriod.from': { $lte: new Date(rData.bookingPeriod.to) },
          'bookingPeriod.to': { $gte: new Date(rData.bookingPeriod.from) }
        },
        {
          'bookingPeriod.from': { $gte: new Date(rData.bookingPeriod.from), $lte: new Date(rData.bookingPeriod.to) }
        },
        {
          'bookingPeriod.to': { $gte: new Date(rData.bookingPeriod.from), $lte: new Date(rData.bookingPeriod.to) }
        }
      ]
    }); 
    if(isNotAvailableSlot){
      console.log("slot is not available found a booking ", isNotAvailableSlot._id)
      throw new ApiError(400, "SLOT_NOT_AVAILABLE");
    } 
    // Apply coupon if provided
    const startDate = new Date(rData.bookingPeriod.from);
    const endDate = new Date(rData.bookingPeriod.to);
    const totalHours = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    let totalAmount = totalHours * (garage.price || 0), discount = 0  ,couponApplied = false , couponDetails = null ;
    if (rData.couponCode) {
      // In a real application, you would validate the coupon here
      // This is a simplified example

      const isValidCoupon = await validateCoupon(rData.couponCode, verifiedAuth?.user);
      
      if (isValidCoupon) {
        // Example: 10% discount
        discount = totalAmount * 0.1;
        totalAmount -= discount;
        couponApplied = true;
        couponDetails = {
          code: rData.couponCode,
          discount: discount,
          discountPercentage: 10
        };
      }
    }

    // Update booking with payment and checkout details
    const booking = await GarageBooking.create({
      garageId: rData.garageId,
      bookedSlot: bookedSlotId,
      customerId: verifiedAuth.user._id ,
      bookingPeriod: rData.bookingPeriod,
      vehicleNumber: rData.vehicleNumber,
      totalAmount : totalAmount +discount ,
      discount : discount ,
      amountToPaid:  totalAmount,
      payment: {
        amount: totalAmount,
        method: rData.paymentMethod,
        status: 'PENDING',
        transactionId: null,
        paidAt: null,
      },
      coupon: couponApplied ? rData.couponCode : undefined ,
    })

    // In a real application, you would integrate with a payment gateway here
    // and process the payment

    const response = {
      bookingId: booking._id,
      garageName: garage.garageName,
      slot: booking.bookedSlot,
      bookingPeriod: booking.bookingPeriod,
      vehicleNumber: booking.vehicleNumber,
      pricing: {
        basePrice: totalHours * (garage.price || 0),
        discount: discount,
        couponApplied: couponApplied,
        couponDetails: couponApplied ? couponDetails : null,
        totalAmount: totalAmount
      },
      payment: {
        method: rData.paymentMethod,
        status: 'PENDING'
      }
    };

    res.status(200).json(new ApiResponse(200, response));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ApiError(400, 'VALIDATION_ERROR', err.issues);
    }

    throw err;
  }
});

// Helper function to validate coupon (placeholder implementation)
async function validateCoupon(code: string, user: mongoose.Document<any , any , IUser>): Promise<boolean> {
  // In a real application, you would check the coupon against a database
  // and verify if it's valid for this user
  return code.startsWith('DISC');
}

export const bookGarageSlot = asyncHandler(async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | undefined;
  
  try {
    const verifiedUser = await verifyAuthentication(req);
    
    if (!(verifiedUser?.userType === "user" )) {
      throw new ApiError(401, "User must be a verified user");
    }

    const rData = BookingData.parse(req.body);
    const booking = await GarageBooking.findById(rData.bookingId);
    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }
    if(booking.customerId.toString() !== verifiedUser.user._id.toString()){
      console.log("customerId:", booking.customerId);
      console.log("userId:", verifiedUser.user._id);
      throw new ApiError(401, "User is not authorized to book this slot");
    }
    // Start transaction
    if(booking.paymentDetails?.status === "SUCCESS" && booking.paymentDetails.transactionId){
      throw new ApiError(400, "USER ALREADY PAID AND BOOKED") ;
    }
    session = await mongoose.startSession();
    session.startTransaction();

    // Check for overlapping bookings
    const bookingFrom = new Date (booking.bookingPeriod.from.toISOString()) ;
    const bookingTo = new Date(booking.bookingPeriod.to.toISOString() );
    const existingBookings = await GarageBooking.countDocuments({
      garageId: booking.garageId,
      bookedSlot: booking.bookedSlot, 
      "paymentDetails.status" :"SUCCESS",
      $or: [
        {
          'bookingPeriod.from': { $lt:bookingTo },
          'bookingPeriod.to': { $gt:bookingFrom }
        },
        {
          'bookingPeriod.from': { $gte:bookingFrom, $lte:bookingTo }
        },
        {
          'bookingPeriod.to': { $gte:bookingFrom, $lte: bookingTo }
        }
      ]
    }).session(session);
    if(existingBookings ){
      throw new ApiError(400, "SLOT_NOT_AVAILABLE");
    }

    if(!ValidateTranscation(rData.transactionId)) throw new ApiError(400, "INVALID_TRANSACTION_ID");

    const updateBooking = await GarageBooking.findByIdAndUpdate(rData.bookingId,{
      paymentDetails : {
        status : "SUCCESS" ,
        transactionId : rData.transactionId ,
        paidAt : new Date()
      }
    }).exec() ;
    await session.commitTransaction();
    
    res.status(201).json(new ApiResponse(201, { booking: updateBooking }));
  } catch (err) {
    if (session) {
      await session.abortTransaction();
    }
    if (err instanceof z.ZodError) {
      console.log(err.issues) ;
      throw new ApiError(400, "DATA_VALIDATION_ERROR", err.issues);
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});
function ValidateTranscation(transId : string):boolean{
  return true;
}
/**
 * Get garage details
 */
export const getGarageDetails = asyncHandler(async (req: Request, res: Response) => {
  try {
    const garageId = z.string().parse(req.params.id);
    
    const garage = await Garage.findById(garageId);
    if (!garage) {
      throw new ApiError(404, "GARAGE_NOT_FOUND");
    }

    res.status(200).json(new ApiResponse(200, { 
      garage,
      isOpen: garage.isOpenNow()
    }));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ApiError(400, "INVALID_ID");
    }
    throw err;
  }
});

export const deleteGarage = asyncHandler(async (req,res)=>{
  try{
  const garageId = z.string().parse(req.query.id);
  const authUser = await verifyAuthentication(req);
  if(!authUser?.user || authUser.userType !== "merchant") throw new ApiError(403,"UNAUTHORIZED_ACCESS")
  const del = Garage.findOneAndDelete({
    _id: garageId,
    owner: authUser?.user
  })
  if(!del){
    if(await Garage.findById(garageId))throw new ApiError(403, "ACCESS_DENIED");
    throw new ApiError(404,"NOT_FOUND");
  }else {
    res.status(200).json(new ApiResponse(200,del)) ;
  }
  }catch(error){
    if(error instanceof z.ZodError) throw new ApiError(400,"INVALID_DATA") ;
    throw error ;
  }
})

export const getListOfGarage = asyncHandler(async (req, res) => {
  try {
    const longitude = z.coerce.number().optional().parse(req.query.longitude);
    const latitude = z.coerce.number().optional().parse(req.query.latitude);
    const owner = z.string().optional().parse(req.query.owner) ;
    console.log(longitude, latitude);
    const queries: mongoose.FilterQuery<IGarage> = {};
    if(owner){
      queries.owner = owner ;
    }
    if (longitude && latitude) {
      queries.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      };
    }

    const result = await Garage.find(queries).exec();
    if (result) {
      res.status(200).json(new ApiResponse(200, result));
    } else throw new ApiError(500);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(400, "INVALID_QUERY", error.issues);
    } else if (error instanceof ApiError) throw error;
    console.log(error);
    throw new ApiError(500, "Server Error", error);
  }
});
