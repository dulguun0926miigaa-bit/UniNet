import { Children, Fragment, isValidElement } from "react";
import StyledSelect from "./StyledSelect.jsx";

function textValue(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textValue).join("");
  if (isValidElement(node)) return textValue(node.props.children);
  return "";
}

function collectOptions(children, output = []) {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      collectOptions(child.props.children, output);
      return;
    }
    if (child.type !== "option") return;
    const fallbackValue = textValue(child.props.children);
    output.push({
      value: String(child.props.value ?? fallbackValue),
      label: child.props.children,
      disabled: Boolean(child.props.disabled),
    });
  });
  return output;
}

export default function NativeStyledSelect({
  children,
  value,
  defaultValue = "",
  onChange,
  name,
  required = false,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  ...rest
}) {
  const options = collectOptions(children);
  return (
    <StyledSelect
      value={value}
      defaultValue={defaultValue}
      onChange={nextValue => onChange?.({ target: { value: nextValue, name }, currentTarget: { value: nextValue, name } })}
      options={options}
      name={name}
      required={required}
      disabled={disabled}
      ariaLabel={ariaLabel}
      className="w-full"
      buttonClassName={className}
      {...rest}
    />
  );
}
