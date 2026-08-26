import { useEffect, useRef, useState } from "react";

interface GoogleMapsPlace {
  formatted_address?: string;
  name?: string;
}

interface GoogleMapsAutocomplete {
  addListener: (eventName: string, handler: () => void) => void;
  getPlace: () => GoogleMapsPlace;
}

interface GoogleMapsNamespace {
  places: {
    Autocomplete: new (
      input: HTMLInputElement,
      options?: { fields?: string[] }
    ) => GoogleMapsAutocomplete;
  };
  event: {
    clearInstanceListeners: (instance: unknown) => void;
  };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
  }
}

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_ADDRESS_API_KEY ?? import.meta.env.GOOGLE_ADDRESS_API_KEY) as string | undefined;

let googleMapsLoadPromise: Promise<void> | null = null;

/** Loads the Google Maps JS SDK (places library) once and caches the promise for reuse across mounts. */
const loadGoogleMapsScript = (): Promise<void> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("Google address API key is not configured"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google Maps script"));
      document.head.appendChild(script);
    }).catch((err) => {
      googleMapsLoadPromise = null;
      throw err;
    });
  }
  return googleMapsLoadPromise as Promise<void>;
};

interface AddressAutocompleteInputProps {
  id?: string;
  label?: string;
  value: string;
  placeholder?: string;
  error?: string;
  onChange: (address: string) => void;
}

/** Plain text address input that upgrades itself with Google Places autocomplete when the API key/script are available. */
const AddressAutocompleteInput = ({
  id = "address",
  label = "Address",
  value,
  placeholder = "Start typing an address...",
  error,
  onChange,
}: AddressAutocompleteInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<GoogleMapsAutocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  const [autocompleteUnavailable, setAutocompleteUnavailable] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return;
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "name"],
        });
        autocompleteRef.current = autocomplete;
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const address = place?.formatted_address || place?.name;
          if (address) onChangeRef.current(address);
        });
      })
      .catch(() => {
        if (!cancelled) setAutocompleteUnavailable(true);
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none ${
          error ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-[#3d6fe0]"
        }`}
      />
      {autocompleteUnavailable && !error && (
        <p className="mt-1 text-[11px] text-slate-400">Address suggestions unavailable — you can still type the address manually.</p>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
    </div>
  );
};

export default AddressAutocompleteInput;
