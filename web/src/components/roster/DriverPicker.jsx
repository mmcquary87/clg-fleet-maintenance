import { useEffect, useState } from "react";
import { Field, Select, Input } from "../../ds";
import { useDriverNames } from "../../hooks/useDriverNames";

const NEW_DRIVER = "__new__";

/** Driver name field shared by the Roster and Home Time forms — a dropdown
 * of every driver name already seen in the app, with a "+ Add a new
 * driver" escape hatch since there's no canonical driver list yet. */
export default function DriverPicker({ value, onChange }) {
  const { names } = useDriverNames();
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (value && names.length > 0 && !names.includes(value)) setCustomMode(true);
  }, [names, value]);

  const selectValue = customMode ? NEW_DRIVER : value || "";

  return (
    <Field label="Driver" required style={{ gridColumn: "1 / -1" }}>
      <Select
        required={!customMode}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === NEW_DRIVER) {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        placeholder="Choose a driver"
        options={[...names, { value: NEW_DRIVER, label: "+ Add a new driver" }]}
      />
      {customMode && (
        <Input required value={value} onChange={(e) => onChange(e.target.value)} placeholder="Full name or driver ID" style={{ marginTop: 8 }} />
      )}
    </Field>
  );
}
