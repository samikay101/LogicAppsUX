import { configureStore } from '@reduxjs/toolkit';
import type {} from 'redux-thunk';
import { templateSlice } from './templateSlice';
import { manifestSlice } from './manifestSlice';

export const templateStore = configureStore({
  reducer: {
    template: templateSlice.reducer,
    manifest: manifestSlice.reducer,
  },
});

export const templatesPathFromState = '../../templates/samples';
export type RootState = ReturnType<typeof templateStore.getState>;
export type AppDispatch = typeof templateStore.dispatch;