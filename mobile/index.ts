import { registerRootComponent } from 'expo';
// Defines the live-directions location task before anything else, so background location
// updates find it even when the app is started just for them.
import './src/live/liveTrip';
import App from './src/App';

registerRootComponent(App);
