import { LiveRepository } from '../data/liveRepository';
import { TransitRepository } from '../data/transitRepository';
import { nativeSnapshotFetcher } from '../native';

/** The app's one repository (MaslulApp.repo in Kotlin): its caches are shared by every screen. */
export const repo = new TransitRepository(new LiveRepository(nativeSnapshotFetcher));
