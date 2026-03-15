import type { BeammpApi } from '../app/beammp-api';

declare global {
  interface Window {
    beammpApi?: BeammpApi;
  }
}

export {};
