import { useEffect, useState } from "react";
import { Field, Select, Input } from "../../ds";
import { useDriverNames } from "../../hooks/useDriverNames";

const NEW_DRIVER = "__new__";

/** Driver name field shared by the Roster and Home Time forms — a dropdown
 * of every driver name already seen in the app (real synced Alvys drivers
 * plus anything entered by hand), with a "+ Add a new driver" escape
 * hatch since not every driver is in Alvys yet. Reports both the name and
 * the matched driver's real id (null if unmatched/custom) so callers can
 * link records to a real driver instead of just a name string.
 *
 * activeOnly restricts the list to currently-active synced drivers (no
 * historical/unmatched names from old roster/home-time/chargeback rows) --
 * opt in for forms where picking a departed driver doesn't make sense. */
export default function DriverPicker({ value, driverId, onChange, activeOnly = false }) {
  const { options } = useDriverNames({ activeOnly });
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (value && options.length > 0 && !options.some((o) => o.name === value)) setCustomMode(true);
  }, [options, value]);

  const selectValue = customMode ? NEW_DRIVER : value || "";

  return (
    <Field label="Driver" required style={{ gridColumn: "1 / -1" }}>
      <Select
        required={!customMode}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === NEW_DRIVER) {
            setCustomMode(true);
            onChange({ name: "", driverId: null });
          } else {
            setCustomMode(false);
            const match = options.find((o) => o.name === e.target.value);
            onChange({ name: e.target.value, driverId: match?.id ?? null });
          }
        }}
        placeholder="Choose a driver"
        options={[...options.map((o) => o.name), { value: NEW_DRIVER, label: "+ Add a new driver" }]}
      />
      {customMode && (
        <Input required value={value} onChange={(e) => onChange({ name: e.target.value, driverId: null })} placeholder="Full name or driver ID" style={{ marginTop: 8 }} />
      )}
    </Field>
  );
}
