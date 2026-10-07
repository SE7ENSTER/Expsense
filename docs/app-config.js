// ExpenseFlow environment configuration
// UAT currently uses the existing Firebase project while PROD remains unconfigured.
// Create a separate Firebase PROD project before production launch.

export const APP_ENV = 'UAT';
export const APP_VERSION = '0.30.0-uat.1';

export const firebaseConfig = {
  apiKey: 'AIzaSyByUZX7ScSa__yrkmOjh9sbviKg1Qppcl4',
  authDomain: 'expsense-cf0a5.firebaseapp.com',
  projectId: 'expsense-cf0a5',
  storageBucket: 'expsense-cf0a5.firebasestorage.app',
  messagingSenderId: '667841901219',
  appId: '1:667841901219:web:6c9c2226ab74885eb08516',
  measurementId: 'G-0CFSZ757Z9'
};

export function exposeEnvironment(){
  window.EXPENSEFLOW_ENV = Object.freeze({
    environment: APP_ENV,
    version: APP_VERSION,
    firebaseProjectId: firebaseConfig.projectId
  });
  document.documentElement.dataset.appEnv = APP_ENV.toLowerCase();
}
