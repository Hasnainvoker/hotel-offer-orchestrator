import { Router } from 'express';
import { getHotels } from '../controllers/hotel.controller';

export const hotelRouter = Router();

// GET /api/hotels?city=delhi[&minPrice=..][&maxPrice=..]
hotelRouter.get('/hotels', getHotels);
