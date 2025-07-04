import mongoose from "mongoose";
import { generateParkingSpaceID } from "../utils/lotProcessData.js";

export interface IGarage {
  owner: mongoose.Types.ObjectId;
  garageName: string;
  about: string;
  address: string;
  location: { type: "Point"; coordinates: [number, number] };
  contactNumber: string;
  price: number,
  email?: string;
  generalAvailable : [
    {
      day: "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
      isOpen?: boolean;
      openTime?: string;
      closeTime?: string;
      is24Hours: boolean;
    }
  ];
  images: string[];
  isVerified: boolean;
  isActive: boolean;
  spacesList: Map<string, number>;
  is24x7: boolean;
  emergencyContact?: {
    person: string;
    number: string;
  };
}
interface GarageMethods {
  isOpenNow: () => boolean;
}
const garageSchema = new mongoose.Schema<IGarage, mongoose.Model<IGarage>, GarageMethods>({
    owner: {
      type: mongoose.Schema.ObjectId,
      ref: "Merchant",
      required: true
    },
    price: {type: Number, required:true},
    garageName: {
      type: String,
      required: true,
      trim: true
    },
    about: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required : true,
        default: [0,0]
      }
    },
    contactNumber: {
      type: String,
      required: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    generalAvailable: [{
      day: {
        type: String,
        enum: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
        required: true
      },
      isOpen: {
        type: Boolean,
        default: true
      },
      openTime: String,
      closeTime: String,
      is24Hours: {
        type: Boolean,
        default: false
      }
    }],
    images: [String],
    isVerified: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    spacesList: {
      type: Map,
      of: Number
    },
    is24x7: {
      type: Boolean,
      default: false
    },
    emergencyContact: {
      phone: String,
      available: Boolean
    },
    // tags: [String]
  }, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    methods : {
      isOpenNow : function(){
        const now = new Date();
        const today = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase().slice(0, 3);
    
        const todayHours = this.generalAvailable.find(wh => wh.day === today);
        
        if (!todayHours || !todayHours.isOpen) return false;
        if (todayHours.is24Hours) return true;
        
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const openTime = parseInt(todayHours.openTime?.replace(':', '') || '0');
        const closeTime = parseInt(todayHours.closeTime?.replace(':', '') || '0');
        
        return currentTime >= openTime && currentTime <= closeTime;
      },
      getAllSlots : function(){
        const res = new Set<string>()
        if(this.spacesList){
          this.spacesList.forEach((value:number ,key:string)=>{
            for(let i = 1 ; i <= value ; i++){
                res.add(generateParkingSpaceID(key,i.toString())) ;
            }
        })
        }
        return res
      }
    },

  });
  
  // Create 2dsphere index for location-based queries
  garageSchema.index({ location: '2dsphere' });
  
  // Garage Booking Schema
  const garageBookingSchema = new mongoose.Schema({
    garageId: {
      type: mongoose.Types.ObjectId,
      ref: "Garage",
      required: true
    },
    customerId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true
    },
    bookingPeriod :{ 
      type : {
      from : {type : Date, required : true} ,
      to : {type : Date, required : true} 
      }, 
      required : true 
    },
    vehicleNumber : String,
    bookedSlot : {type :String, required : true} ,
    totalAmount : { type : Number , required : true},
    amountToPaid : { type : Number , required : true},
    couponCode : String ,
    discount :{type : Number , default :0 },
    paymentDetails : {
      transactionId : String ,
      amount : Number ,
      method : {type : String , enum: ["CASH", "CREDIT", "DEBIT", "UPI", "PAYPAL"]},
      status : {type : String , enum: ["PENDING", "SUCCESS", "FAILED"]},
    }
  }, { timestamps: true });
  
  export const Garage = mongoose.model("Garage", garageSchema);
  export const GarageBooking = mongoose.model("GarageBooking", garageBookingSchema);