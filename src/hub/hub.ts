import './hub.css';
import { BUILD_DATE, VERSION } from '../version';

document.getElementById('ver')!.textContent = `v${VERSION} · ${BUILD_DATE}`;
