import './hub.css';
import { BUILD_DATE, VERSION } from '../version';
import { startPreviews } from './previews';

document.getElementById('ver')!.textContent = `v${VERSION} · сборка ${BUILD_DATE}`;
startPreviews();
