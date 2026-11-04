import { useSyncExternalStore } from 'react';
import { getNBWEndpointState, subscribeNBWEndpoints } from './nbwEndpoints.js';
import { getNBWOAuthStatus, subscribeNBWOAuth } from './nbwOAuth.js';

export const useNBWEndpoints = () => useSyncExternalStore(subscribeNBWEndpoints, getNBWEndpointState, getNBWEndpointState);
export const useNBWOAuth = () => useSyncExternalStore(subscribeNBWOAuth, getNBWOAuthStatus, getNBWOAuthStatus);
