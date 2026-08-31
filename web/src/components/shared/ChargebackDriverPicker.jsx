import { useState } from "react";
import { Input, Select } from "../../ds";
import { useDriverNames } from "../../hooks/useDriverNames";

const NEW_DRIVER = "__new__";

export default function ChargebackDriverPicker({ name, onChange }) {
  const { options } = useDriverNames();
  const [customMode, setCustomMode] = useState(!!name && options.length > 0 && !options.some((o) => o.name === name));

  const selectValue = customMode ? NEW_DRIVER : name || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 260 }}>
      <Select
        required={!customMode} value={selectValue}
        onChange={(e) => {
          if (e.target.value === NEW_DRIVER) {
            setCustomMode(true);
            onChange("", null);
          } else {
            setCustomMode(false);
            const match = options.find((o) => o.name === e.target.value);
            onChange(e.target.value, match?.id ?? null);
          }
        }}
        placeholder="Choose a driver"
        options={[...options.map((o) => o.name), { value: NEW_DRIVER, label: "+ Add a new driver" }]}
      />
      {customMode && (
        <Input required value={name} onChange={(e) => onChange(e.target.value, null)} placeholder="Full name or driver ID" />
      )}
    </div>
  );
}
