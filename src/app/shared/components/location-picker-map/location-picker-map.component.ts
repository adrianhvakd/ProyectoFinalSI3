import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCrosshair, lucideMapPin, lucideRotateCcw } from '@ng-icons/lucide';
import type * as LeafletNs from 'leaflet';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-location-picker-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmSpinnerImports],
  providers: [
    provideIcons({
      lucideMapPin,
      lucideCrosshair,
      lucideRotateCcw,
    }),
  ],
  templateUrl: './location-picker-map.component.html',
})
export class LocationPickerMapComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly defaultLat = input<number>(-19.5836);
  readonly defaultLng = input<number>(-65.7531);
  readonly zoom = input<number>(14);
  readonly heightClass = input<string>('h-64');
  readonly readonly = input<boolean>(false);

  readonly locationSelected = output<GeoCoordinates>();

  readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  readonly locating = signal<boolean>(false);
  readonly mapReady = signal<boolean>(false);

  private leaflet: typeof LeafletNs | null = null;
  private map: LeafletNs.Map | null = null;
  private marker: LeafletNs.Marker | null = null;
  private pinIcon: LeafletNs.DivIcon | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      if (isPlatformBrowser(this.platformId)) {
        void this.initMap();
      }
    });

    effect(() => {
      const nextLat = this.lat();
      const nextLng = this.lng();
      if (!this.map || nextLat === null || nextLng === null) {
        return;
      }
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        return;
      }
      this.placeOrMoveMarker(nextLat, nextLng, false);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }

  centerOnDefault(): void {
    if (this.readonly()) {
      return;
    }
    const lat = this.defaultLat();
    const lng = this.defaultLng();
    this.placeOrMoveMarker(lat, lng, true);
    this.map?.setView([lat, lng], this.zoom());
  }

  useCurrentGeolocation(): void {
    if (this.readonly() || !isPlatformBrowser(this.platformId)) {
      return;
    }
    if (!('geolocation' in navigator)) {
      toast.warning('Su navegador no soporta geolocalización automática.');
      return;
    }

    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        if (this.destroyed || !this.map) {
          return;
        }
        const lat = this.roundCoord(pos.coords.latitude);
        const lng = this.roundCoord(pos.coords.longitude);
        this.placeOrMoveMarker(lat, lng, true);
        this.map.setView([lat, lng], 16);
      },
      () => {
        this.locating.set(false);
        toast.warning(
          'No se pudo obtener su ubicación actual. Haga clic o arrastre el marcador manualmente.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private async initMap(): Promise<void> {
    const containerEl = this.mapContainer()?.nativeElement;
    if (!containerEl || this.destroyed) {
      return;
    }

    const mod = await import('leaflet');
    if (this.destroyed) {
      return;
    }

    const L =
      (mod as unknown as typeof LeafletNs & { default?: typeof LeafletNs }).default ??
      (mod as unknown as typeof LeafletNs);
    this.leaflet = L;

    const initialLat = this.lat() ?? this.defaultLat();
    const initialLng = this.lng() ?? this.defaultLng();

    this.pinIcon = L.divIcon({
      className: '',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" fill="none"><path d="M14 1C6.82 1 1 6.82 1 14c0 9.75 13 21 13 21s13-11.25 13-21C27 6.82 21.18 1 14 1Z" fill="#0f172a" stroke="#ffffff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#10b981"/></svg>`,
      iconSize: [28, 36],
      iconAnchor: [14, 35],
    });

    const map = L.map(containerEl, {
      center: [initialLat, initialLng],
      zoom: this.zoom(),
      scrollWheelZoom: !this.readonly(),
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    this.map = map;

    if (this.lat() !== null && this.lng() !== null) {
      this.placeOrMoveMarker(initialLat, initialLng, false);
    } else if (!this.readonly()) {
      this.placeOrMoveMarker(initialLat, initialLng, false);
    }

    if (!this.readonly()) {
      map.on('click', (evt: LeafletNs.LeafletMouseEvent) => {
        const lat = this.roundCoord(evt.latlng.lat);
        const lng = this.roundCoord(evt.latlng.lng);
        this.placeOrMoveMarker(lat, lng, true);
      });
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(containerEl);
    }

    setTimeout(() => {
      if (!this.destroyed) {
        this.map?.invalidateSize();
        this.mapReady.set(true);
      }
    }, 120);
  }

  private placeOrMoveMarker(lat: number, lng: number, emitEvent: boolean): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) {
      return;
    }

    const currentLatLng = this.marker?.getLatLng();
    if (
      currentLatLng &&
      Math.abs(currentLatLng.lat - lat) < 0.000001 &&
      Math.abs(currentLatLng.lng - lng) < 0.000001
    ) {
      return;
    }

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        draggable: !this.readonly(),
        icon: this.pinIcon ?? undefined,
      }).addTo(map);

      if (!this.readonly()) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          this.locationSelected.emit({
            lat: this.roundCoord(pos.lat),
            lng: this.roundCoord(pos.lng),
          });
        });
      }

      this.marker = marker;
    }

    if (emitEvent) {
      this.locationSelected.emit({ lat, lng });
    }
  }

  private roundCoord(val: number): number {
    return Math.round(val * 1000000) / 1000000;
  }
}
