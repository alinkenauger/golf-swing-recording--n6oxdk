/// <reference types="next" />
/// <reference types="next/types/global" />
/// <reference types="next/image-types/global" />

// @types/node v20.8.4
// @types/react v18.2.25
// next v14.x

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL: string;
    NEXT_PUBLIC_AUTH0_DOMAIN: string;
    NEXT_PUBLIC_AUTH0_CLIENT_ID: string;
    NEXT_PUBLIC_STRIPE_PUBLIC_KEY: string;
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    'video-player': object;
    'annotation-canvas': object;
    'voice-recorder': object;
  }
}