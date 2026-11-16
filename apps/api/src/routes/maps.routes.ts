import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export const mapsRouter = Router();

/**
 * GET /api/v1/maps/places
 * Pure Google Places Autocomplete API proxy
 */
mapsRouter.get('/places', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = (req.query.input as string || '').trim();
    if (!input) {
      res.json({ predictions: [], status: 'ZERO_RESULTS' });
      return;
    }

    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
      throw new AppError('Google Maps API key is not configured', 500, 'MAPS_CONFIG_ERROR');
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('components', 'country:in');
    url.searchParams.set('language', 'en');

    if (req.query.sessiontoken) {
      url.searchParams.set('sessiontoken', req.query.sessiontoken as string);
    }

    const gRes = await fetch(url.toString());
    const data = await gRes.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/maps/geocode
 * Pure Google Maps Geocoding & Reverse Geocoding API proxy
 */
mapsRouter.get('/geocode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
      throw new AppError('Google Maps API key is not configured', 500, 'MAPS_CONFIG_ERROR');
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'en');

    if (req.query.place_id) {
      url.searchParams.set('place_id', (req.query.place_id as string).trim());
    } else if (req.query.latlng) {
      url.searchParams.set('latlng', (req.query.latlng as string).trim());
    } else if (req.query.address) {
      url.searchParams.set('address', (req.query.address as string).trim());
      url.searchParams.set('components', 'country:in');
    } else {
      res.json({ results: [], status: 'INVALID_REQUEST' });
      return;
    }

    const gRes = await fetch(url.toString());
    const data = await gRes.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

