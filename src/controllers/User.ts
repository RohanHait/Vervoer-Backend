import { Request, Response, NextFunction } from "express";
import { IMerchant, Merchant } from "../models/merchant.model.js";
import { Driver, IDriver } from "../models/driver.model.js";
import { IUser, User } from "../models/normalUser.model.js";
import { sendEmail, generateOTP, getOtpExpiry } from "../utils/mailer.utils.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { registerUserSchema } from "../validators/userValidators.js";
import { z } from "zod/v4";
import { ApiError } from "../utils/apierror.js";
import { jwtEncode } from "../utils/jwt.js";
import { verifyAuthentication } from "../middleware/verifyAuthhentication.js";
import axios from "axios";
import { asyncHandler } from "../utils/asynchandler.js";
import { BlacklistedToken } from "../models/blacklistedToken.model.js";
import { BankDetailsSchema } from "../models/bankDetails.model.js";
// import 
import mongoose from "mongoose";

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      phoneNumber,
      password,
      firstName,
      lastName,
      email,
      country,
      state,
      zipCode,
      userType, 
    } = registerUserSchema.parse(req.body);

    // const existingUser = await User.findOne({ phoneNumber });
    // if (existingUser) {
    //   res
    //     .status(400)
    //     .json({ success: false, message: "Phone number already registered" });
    //   return;
    
    if(!password ){
      throw new ApiError(400, "PASSWORD_REQUIRED") ;
        }    
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = getOtpExpiry();

    let newUser = null;

    if (userType === "merchant") {
      newUser = await Merchant.create({
        phoneNumber,
        password: hashedPassword,
        firstName,
        lastName,
        email,
        country,
        state,
        zipCode,
        userType,
        otp,
        otpExpiry,
      });
    } else if (userType === "driver") {
      newUser = await Driver.create({
        phoneNumber,
        password: hashedPassword,
        firstName,
        lastName,
        email,
        country,
        state,
        zipCode,
        userType,
        otp,
        otpExpiry,
      });
    } else {
      // Regular user 
      newUser = await User.create({
        phoneNumber,
        password: hashedPassword,
        firstName,
        lastName,
        email,
        country,
        state,
        zipCode,
        userType,
        otp,
        otpExpiry,
      });
    }

    await sendEmail(email, "Your Registration OTP", `Your OTP is: ${otp}`);

    const token = jwtEncode({ userId: newUser._id, userType: userType });

    res.status(201).json({
      success: true,
      message: "User registered successfully, OTP sent to email",
      token,
    });
  } catch (error) {
    if(error instanceof z.ZodError){
      throw new ApiError(400, "INVALID_DATA") ;
    }
    next(error);
  }
};

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { otp } = req.body;
    const user = await verifyAuthentication(req).then(e=>e?.user) ;
    if (!user) {
      res
      .status(404)
      .json({ success: false, message: "User not found" });
      return ;
    }

    if (user.isVerified) {
      res
      .status(400)
      .json({ success: false, message: "User already verified" });
      return
    }

    if (user.otp !== otp) {
      res.status(400).json({ success: false, message: "Invalid OTP" });
      return
    }

    if (user.otpExpiry && user.otpExpiry < new Date()) {
      res.status(400).json({ success: false, message: "OTP expired" });
      return ;
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Account verified successfully" });
  } catch (error) {
    if(error instanceof jwt.TokenExpiredError){
      throw new ApiError(400, "TOKEN_EXPIRED")
    }else if (error instanceof jwt.JsonWebTokenError){
      throw new ApiError(401 , "UNAUTHORIZED_ACCESS") ;
    }
    next(error);
  }
};


// socialRegistration
export const socialRegisterSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  token: z.string(),
  userType: z.enum(["user", "driver", "merchant"]),
});

export const socialRegister = asyncHandler(async (req: Request, res: Response) => {
 
  const { provider, token, userType } = socialRegisterSchema.parse(req.body);

  let socialUser;

  // Verify Google token
  if (provider === "google") {
    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
    );
    socialUser = response.data;

  // Verify Facebook token
  } else if (provider === "facebook") {
    const response = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${token}`
    );
    socialUser = response.data;

  } else {
    throw new ApiError(400, "Unsupported provider");
  }

  if (!socialUser.email) {
    throw new ApiError(400, "Email not found in social profile");
  }

  let existingUser;
  if (userType === "merchant") {
    existingUser = await Merchant.findOne({ email: socialUser.email });
  } else if (userType === "driver") {
    existingUser = await Driver.findOne({ email: socialUser.email });
  } else {
    existingUser = await User.findOne({ email: socialUser.email });
  }

  let newUser;

  if (!existingUser) {
    const baseData = {
      email: socialUser.email,
      firstName: socialUser.name?.split(" ")[0] || "",
      lastName: socialUser.name?.split(" ")[1] || "",
      loginType: provider,
      socialId: socialUser.sub || socialUser.id,
      isVerified: true,
      userType: userType, 
    };

    if (userType === "merchant") {
      newUser = await Merchant.create(baseData);
    } else if (userType === "driver") {
      newUser = await Driver.create(baseData);
    } else {
      newUser = await User.create(baseData);
    }
  } else {
    newUser = existingUser;
  }

  const jwtToken = jwtEncode({ userId: newUser._id, userType });

  res.status(200).json({
    success: true,
    message: "Social login successful",
    token: jwtToken,
  });
});


export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  userType: z.enum(["user", "merchant", "driver"]),
});

export const loginUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // Validate input
    const { email, password, userType } = loginSchema.parse(req.body);

    let existingUser: any = null;

    // Fetch user based on userType
    if (userType === "merchant") {
      existingUser = await Merchant.findOne({ email });
    } else if (userType === "driver") {
      existingUser = await Driver.findOne({ email });
    } else {
      existingUser = await User.findOne({ email });
    }

    // If user not found
    if (!existingUser) {
      throw new ApiError(404, "User not found");
    }

    // If password missing for this user (social logins)
    if (!existingUser?.password) {
      throw new ApiError(400, "Password login not available for this account");
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      throw new ApiError(401, "Invalid email or password");
    }

    // Generate JWT token
    const token = jwtEncode({ userId: existingUser._id, userType });

    // Respond
    res.status(200).json({
      success: true,
      message: "Login successful",
      user : existingUser,
      userType ,
      token,
    });
  }
);


// logout User
export const logoutUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];

    const decoded: any = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      res.status(400).json({ success: false, message: "Invalid token" });
      return;
    }

    await BlacklistedToken.create({
      token,
      expiresAt: new Date(decoded.exp * 1000),
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  }
);



export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  userType: z.enum(["user", "merchant", "driver"]),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  userType: z.enum(["user", "merchant", "driver"]),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  userType: z.enum(["user", "merchant", "driver"]),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});


const getUserModel = (type: string): mongoose.Model<any> => {
  if (type === "merchant") return Merchant;
  if (type === "driver") return Driver;
  return User;
};

//  Send OTP to email
export const sendForgotPasswordOtp = asyncHandler( async (req: Request, res: Response, next: NextFunction) => {
    const { email, userType } = forgotPasswordSchema.parse(req.body);
    const UserModel = getUserModel(userType);

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    const otp = generateOTP();
    const otpExpiry = getOtpExpiry();
    if(!user.otpExpiry||  !user.otp ||  new Date(user.otpExpiry) <= new Date()){
      console.log("Genrated OTP:" ,otp)
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      await user.save();
    }
    console.log("The OTP is:", user.otp);
    await sendEmail(email, "Password Reset OTP", `Your OTP is: ${user.otp}`);

    res.status(200).json({ success: true, message: "OTP sent to email" });
});

// Verify OTP
export const verifyForgotPasswordOtp =(req: Request,user :any) => {
  try {
    const { email, otp, userType } = verifyOtpSchema.parse(req.body);
    console.log(user.otp , otp)
    if (user.otp !== otp) {
      throw new ApiError(400, "Invalid OTP");
    }

    if (user.otpExpiry && user.otpExpiry < new Date()) {
      throw new ApiError(400, "OTP expired");
    }

    user.otp = null;
    user.otpExpiry = null;
    user.isVerified = true;
    return ;
    // res.status(200).json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    throw error
  }
};

// Reset Password
export const resetForgottenPassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, userType } = resetPasswordSchema.parse(req.body);
    const UserModel = getUserModel(userType);

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    verifyForgotPasswordOtp(req,user)

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    await user.save();
    const newToken = jwtEncode({ userId: user._id, userType });
    console.log("Successful")
    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.log(error)
    throw error
  }
});


// bank details
const bankDetailsSchema = z.object({
  accountNumber: z.string().min(6),
  ifscCode: z.string().min(4),
  accountHolderName: z.string(),
  branch: z.string(),
});
export const updateBankDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userInfo = await verifyAuthentication(req);

    const { accountNumber, ifscCode, accountHolderName, branch } =
      bankDetailsSchema.parse(req.body);

    userInfo.user.bankDetails = {
      accountNumber,
      ifscCode,
      accountHolderName,
      branch,
    };

    await userInfo.user.save();

    res.status(200).json({
      success: true,
      message: "Bank details updated successfully",
      bankDetails: userInfo.user.bankDetails,
    });
  }
);
