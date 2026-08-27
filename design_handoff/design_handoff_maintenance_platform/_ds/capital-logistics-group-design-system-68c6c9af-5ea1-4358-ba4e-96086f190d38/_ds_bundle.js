/* @ds-bundle: {"format":4,"namespace":"CapitalLogisticsGroupDesignSystem_68c6c9","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Icon","sourcePath":"components/actions/Icon.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Link","sourcePath":"components/actions/Link.jsx"},{"name":"Eyebrow","sourcePath":"components/brand/Eyebrow.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"StarMark","sourcePath":"components/brand/StarMark.jsx"},{"name":"Alert","sourcePath":"components/display/Alert.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Divider","sourcePath":"components/display/Divider.jsx"},{"name":"StatBlock","sourcePath":"components/display/StatBlock.jsx"},{"name":"Table","sourcePath":"components/display/Table.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"8303b140c307","components/actions/Icon.jsx":"2ac01280066f","components/actions/IconButton.jsx":"338d4a76a1f2","components/actions/Link.jsx":"5f630596bdf6","components/brand/Eyebrow.jsx":"04e6a963a153","components/brand/Logo.jsx":"391fa191b4a2","components/brand/StarMark.jsx":"d3cf7a8c0d19","components/display/Alert.jsx":"b5b0f1cb61b4","components/display/Badge.jsx":"0cbea3657e0a","components/display/Card.jsx":"1840d71283c6","components/display/Divider.jsx":"d0d833358492","components/display/StatBlock.jsx":"8c661cfd725b","components/display/Table.jsx":"13c0fe4f5bdf","components/forms/Checkbox.jsx":"4818581ac9dd","components/forms/Field.jsx":"21a708240e52","components/forms/Input.jsx":"9441fb756910","components/forms/Radio.jsx":"c236be2db7c5","components/forms/Select.jsx":"822267447fcd","components/forms/Switch.jsx":"9e9d87fb37ae"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CapitalLogisticsGroupDesignSystem_68c6c9 = window.CapitalLogisticsGroupDesignSystem_68c6c9 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const BASE = 'https://unpkg.com/lucide-static/icons/';

/** Interface glyph. SUBSTITUTION: the brand guide defines no UI icon set, so this wraps Lucide. */
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true",
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      flex: 'none',
      backgroundColor: color,
      WebkitMask: 'url(' + BASE + name + '.svg) center / contain no-repeat',
      mask: 'url(' + BASE + name + '.svg) center / contain no-repeat',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Icon.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    fontSize: 11,
    padding: '8px 14px'
  },
  md: {
    fontSize: 12,
    padding: '12px 22px'
  },
  lg: {
    fontSize: 14,
    padding: '16px 32px'
  }
};
const VARIANTS = {
  primary: {
    bg: 'var(--clg-action-primary-bg)',
    hover: 'var(--clg-action-primary-bg-hover)',
    fg: 'var(--clg-action-primary-fg)',
    border: 'transparent'
  },
  secondary: {
    bg: 'var(--clg-action-secondary-bg)',
    hover: 'var(--clg-action-secondary-bg-hover)',
    fg: 'var(--clg-action-secondary-fg)',
    border: 'transparent'
  },
  outline: {
    bg: 'transparent',
    hover: 'var(--clg-surface-subtle)',
    fg: 'var(--clg-action-quiet-fg)',
    border: 'var(--clg-royal)'
  },
  quiet: {
    bg: 'transparent',
    hover: 'var(--clg-surface-subtle)',
    fg: 'var(--clg-action-quiet-fg)',
    border: 'transparent'
  },
  inverse: {
    bg: 'var(--clg-white)',
    hover: 'var(--clg-smoke)',
    fg: 'var(--clg-navy)',
    border: 'transparent'
  }
};

/** Primary call to action. Labels are tracked uppercase Montserrat, per the brand's collateral. */
function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  href,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const Tag = href && !disabled ? 'a' : 'button';
  const css = {
    display: fullWidth ? 'flex' : 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: fullWidth ? '100%' : undefined,
    fontFamily: 'var(--clg-font-heading)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontSize: s.fontSize,
    padding: s.padding,
    lineHeight: 1,
    border: '1px solid ' + (disabled ? 'transparent' : v.border),
    borderRadius: 'var(--clg-radius-sm)',
    textDecoration: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'var(--clg-action-disabled-bg)' : hover ? v.hover : v.bg,
    color: disabled ? 'var(--clg-action-disabled-fg)' : v.fg,
    transition: 'background-color var(--clg-dur-base) var(--clg-ease-out), color var(--clg-dur-base) var(--clg-ease-out)',
    ...style
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    disabled: Tag === 'button' ? disabled : undefined,
    style: css,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, rest), iconLeft ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: s.fontSize + 4
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.fontSize + 4
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 44,
  lg: 52
};

/** Square icon-only control. 44px default keeps it touch-safe. */
function IconButton({
  icon,
  label,
  variant = 'quiet',
  size = 'md',
  disabled = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const box = SIZES[size] || SIZES.md;
  const tones = {
    primary: {
      bg: 'var(--clg-action-primary-bg)',
      hover: 'var(--clg-action-primary-bg-hover)',
      fg: '#fff',
      border: 'transparent'
    },
    secondary: {
      bg: 'var(--clg-action-secondary-bg)',
      hover: 'var(--clg-action-secondary-bg-hover)',
      fg: '#fff',
      border: 'transparent'
    },
    outline: {
      bg: 'transparent',
      hover: 'var(--clg-surface-subtle)',
      fg: 'var(--clg-royal)',
      border: 'var(--clg-border-default)'
    },
    quiet: {
      bg: 'transparent',
      hover: 'var(--clg-surface-subtle)',
      fg: 'var(--clg-text-body)',
      border: 'transparent'
    },
    inverse: {
      bg: 'rgb(255 255 255 / .10)',
      hover: 'rgb(255 255 255 / .20)',
      fg: '#fff',
      border: 'var(--clg-border-inverse)'
    }
  };
  const t = tones[variant] || tones.quiet;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: box,
      height: box,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid ' + t.border,
      borderRadius: 'var(--clg-radius-sm)',
      background: disabled ? 'var(--clg-action-disabled-bg)' : hover ? t.hover : t.bg,
      color: disabled ? 'var(--clg-action-disabled-fg)' : t.fg,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color var(--clg-dur-base) var(--clg-ease-out)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: Math.round(box * 0.45)
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/actions/Link.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text link. Ruby at rest, Scarlet on hover — the guide's hyperlink specimens. */
function Link({
  href = '#',
  tone = 'default',
  withArrow = false,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const rest_ = {
    default: ['var(--clg-link)', 'var(--clg-link-hover)'],
    inverse: ['#fff', 'var(--clg-moon)'],
    quiet: ['var(--clg-text-body)', 'var(--clg-link)']
  }[tone];
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      color: hover ? rest_[1] : rest_[0],
      textDecoration: 'underline',
      textUnderlineOffset: 2,
      display: withArrow ? 'inline-flex' : undefined,
      alignItems: 'center',
      gap: 6,
      transition: 'color var(--clg-dur-fast) var(--clg-ease-out)',
      ...style
    }
  }, rest), children, withArrow ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-right",
    size: 16
  }) : null);
}
Object.assign(__ds_scope, { Link });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Link.jsx", error: String((e && e.message) || e) }); }

// components/brand/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Tracked uppercase label — the guide's "H E A D I N G" style. */
function Eyebrow({
  children,
  tone = 'brand',
  as: Tag = 'div',
  style,
  ...rest
}) {
  const color = {
    brand: 'var(--clg-text-brand)',
    accent: 'var(--clg-text-accent)',
    muted: 'var(--clg-text-muted)',
    inverse: 'var(--clg-text-inverse)'
  }[tone];
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      fontFamily: 'var(--clg-font-heading)',
      fontSize: 'var(--clg-size-eyebrow)',
      fontWeight: 700,
      letterSpacing: 'var(--clg-tracking-eyebrow)',
      textTransform: 'uppercase',
      color,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SRC = {
  primary: 'logo-primary.svg',
  reverse: 'logo-reverse.svg',
  white: 'logo-white.svg',
  clg: 'logo-clg.svg',
  'clg-reverse': 'logo-clg-reverse.svg'
};

/** Capital Logistics Group lockup, with the guide's half-wordmark clearspace applied. */
function Logo({
  variant = 'primary',
  height = 44,
  clearspace = false,
  assetBase = '../../assets',
  style,
  ...rest
}) {
  const img = /*#__PURE__*/React.createElement("img", {
    src: assetBase + '/' + (SRC[variant] || SRC.primary),
    alt: variant.startsWith('clg') ? 'CLG Transportation' : 'Capital Logistics Group',
    style: {
      height,
      width: 'auto',
      display: 'block'
    }
  });
  if (!clearspace) return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-block',
      ...style
    }
  }, rest), img);
  const pad = Math.round(height * 0.5);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-block',
      padding: pad,
      ...style
    }
  }, rest), img);
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/brand/StarMark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The star icon on its own — the brand's only proprietary mark. */
function StarMark({
  size = 40,
  tone = 'standard',
  crop = false,
  opacity = 1,
  assetBase = '../../assets',
  style,
  ...rest
}) {
  const src = assetBase + '/' + (tone === 'reverse' ? 'mark-star-white.svg' : 'mark-star.svg');
  if (crop) {
    return /*#__PURE__*/React.createElement("span", _extends({
      style: {
        position: 'absolute',
        right: -size * 0.32,
        bottom: -size * 0.38,
        pointerEvents: 'none',
        opacity,
        ...style
      }
    }, rest), /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: "",
      style: {
        height: size,
        display: 'block'
      }
    }));
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-block',
      opacity,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      height: size,
      display: 'block'
    }
  }));
}
Object.assign(__ds_scope, { StarMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/StarMark.jsx", error: String((e && e.message) || e) }); }

// components/display/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Inline message. Scarlet/Ruby for problems, Royal for information. */
function Alert({
  tone = 'info',
  title,
  children,
  icon,
  onDismiss,
  style,
  ...rest
}) {
  const tones = {
    info: {
      bar: 'var(--clg-royal)',
      bg: 'var(--clg-surface-sunken)',
      icon: 'info'
    },
    critical: {
      bar: 'var(--clg-ruby)',
      bg: '#FBEAEB',
      icon: 'alert-triangle'
    },
    success: {
      bar: 'var(--clg-royal)',
      bg: 'var(--clg-surface-subtle)',
      icon: 'check'
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: 'flex',
      gap: 12,
      background: t.bg,
      borderTop: '4px solid ' + t.bar,
      padding: '14px 16px',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || t.icon,
    size: 20,
    color: t.bar
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--clg-font-heading)',
      fontWeight: 700,
      fontSize: 15,
      color: 'var(--clg-text-heading)',
      marginBottom: 2
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--clg-size-small)',
      color: 'var(--clg-text-body)'
    }
  }, children)), onDismiss ? /*#__PURE__*/React.createElement("button", {
    "aria-label": "Dismiss",
    onClick: onDismiss,
    style: {
      background: 'none',
      border: 0,
      cursor: 'pointer',
      color: 'var(--clg-text-muted)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 18
  })) : null);
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Alert.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small status chip. */
function Badge({
  tone = 'brand',
  children,
  style,
  ...rest
}) {
  const tones = {
    brand: ['var(--clg-royal)', '#fff'],
    accent: ['var(--clg-scarlet)', '#fff'],
    critical: ['var(--clg-ruby)', '#fff'],
    neutral: ['var(--clg-smoke)', 'var(--clg-granite)'],
    outline: ['transparent', 'var(--clg-royal)']
  };
  const [bg, fg] = tones[tone] || tones.brand;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      background: bg,
      color: fg,
      border: tone === 'outline' ? '1px solid var(--clg-royal)' : '1px solid transparent',
      fontFamily: 'var(--clg-font-heading)',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '4px 10px',
      borderRadius: 'var(--clg-radius-pill)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Content card: white on a hairline, squared corners, optional scarlet lead rule. */
function Card({
  rule = false,
  tone = 'default',
  padding = 24,
  interactive = false,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const tones = {
    default: {
      background: 'var(--clg-surface-card)',
      border: '1px solid var(--clg-border-subtle)',
      color: 'var(--clg-text-body)'
    },
    subtle: {
      background: 'var(--clg-surface-subtle)',
      border: '1px solid transparent',
      color: 'var(--clg-text-body)'
    },
    brand: {
      background: 'var(--clg-surface-brand)',
      border: '1px solid transparent',
      color: 'var(--clg-text-inverse)'
    },
    deep: {
      background: 'var(--clg-surface-brand-deep)',
      border: '1px solid transparent',
      color: 'var(--clg-text-inverse)'
    },
    gradient: {
      background: 'var(--clg-gradient-brand)',
      border: '1px solid transparent',
      color: 'var(--clg-text-inverse)'
    }
  };
  const t = tones[tone] || tones.default;
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...t,
      borderRadius: 'var(--clg-radius-md)',
      padding,
      boxSizing: 'border-box',
      boxShadow: interactive && hover ? 'var(--clg-shadow-md)' : 'none',
      transition: 'box-shadow var(--clg-dur-base) var(--clg-ease-out)',
      cursor: interactive ? 'pointer' : undefined,
      ...style
    }
  }, rest), rule ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--clg-rule-accent)',
      width: 48,
      background: 'var(--clg-surface-accent)',
      marginBottom: 16
    }
  }) : null, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Divider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Horizontal rule. `accent` renders the brand's short scarlet lead rule. */
function Divider({
  variant = 'hairline',
  width,
  style,
  ...rest
}) {
  const map = {
    hairline: {
      height: 1,
      background: 'var(--clg-border-subtle)',
      width: width || '100%'
    },
    strong: {
      height: 2,
      background: 'var(--clg-border-strong)',
      width: width || '100%'
    },
    accent: {
      height: 'var(--clg-rule-accent)',
      background: 'var(--clg-surface-accent)',
      width: width || 48
    },
    inverse: {
      height: 1,
      background: 'var(--clg-border-inverse)',
      width: width || '100%'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "separator",
    style: {
      border: 0,
      ...map[variant],
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Divider.jsx", error: String((e && e.message) || e) }); }

// components/display/StatBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** A single operational figure with its label. */
function StatBlock({
  value,
  label,
  note,
  tone = 'default',
  align = 'left',
  style,
  ...rest
}) {
  const fg = tone === 'inverse' ? 'var(--clg-text-inverse)' : 'var(--clg-text-heading)';
  const sub = tone === 'inverse' ? 'rgb(255 255 255 / .72)' : 'var(--clg-text-muted)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      textAlign: align,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--clg-font-heading)',
      fontWeight: 700,
      fontSize: 40,
      lineHeight: 1.05,
      letterSpacing: '-0.01em',
      color: fg,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--clg-font-heading)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: tone === 'inverse' ? 'rgb(255 255 255 / .85)' : 'var(--clg-text-brand)',
      marginTop: 8
    }
  }, label), note ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: sub,
      marginTop: 6
    }
  }, note) : null);
}
Object.assign(__ds_scope, { StatBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/StatBlock.jsx", error: String((e && e.message) || e) }); }

// components/display/Table.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Dense operational table: uppercase head, hairline rows, tabular numerals. */
function Table({
  columns = [],
  rows = [],
  zebra = true,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("table", _extends({
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 'var(--clg-size-small)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key || c,
    style: {
      textAlign: c.align || 'left',
      padding: '10px 12px',
      fontFamily: 'var(--clg-font-heading)',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--clg-text-brand)',
      borderBottom: '2px solid var(--clg-border-default)',
      whiteSpace: 'nowrap'
    }
  }, c.label || c)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      background: zebra && i % 2 ? 'var(--clg-surface-subtle)' : 'transparent'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: (c.key || c) + i,
    style: {
      padding: '11px 12px',
      textAlign: c.align || 'left',
      borderBottom: '1px solid var(--clg-border-subtle)',
      color: 'var(--clg-text-body)',
      fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined
    }
  }, r[c.key || c]))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Table.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Square checkbox — Royal when checked, no rounding. */
function Checkbox({
  label,
  checked,
  defaultChecked,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const isOn = checked === undefined ? internal : checked;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--clg-action-disabled-fg)' : 'var(--clg-text-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: isOn,
    disabled: disabled,
    onChange: e => {
      if (checked === undefined) setInternal(e.target.checked);
      onChange && onChange(e);
    },
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid ' + (isOn ? 'var(--clg-royal)' : 'var(--clg-border-default)'),
      background: disabled ? 'var(--clg-surface-subtle)' : isOn ? 'var(--clg-royal)' : 'var(--clg-surface-page)',
      borderRadius: 'var(--clg-radius-sm)',
      transition: 'background-color var(--clg-dur-fast) var(--clg-ease-out)'
    }
  }, isOn ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 5,
      borderLeft: '2px solid #fff',
      borderBottom: '2px solid #fff',
      transform: 'rotate(-45deg) translateY(-1px)'
    }
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--clg-size-body)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Label + help/error wrapper shared by the form controls. */
function Field({
  label,
  help,
  error,
  required = false,
  htmlFor,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontFamily: 'var(--clg-font-heading)',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--clg-text-heading)'
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--clg-scarlet)'
    }
  }, " *") : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--clg-status-critical)'
    }
  }, error) : help ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--clg-text-muted)'
    }
  }, help) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Single-line text input. */
function Input({
  invalid = false,
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'var(--clg-font-body)',
      fontSize: 'var(--clg-size-body)',
      color: disabled ? 'var(--clg-action-disabled-fg)' : 'var(--clg-text-body)',
      background: disabled ? 'var(--clg-surface-subtle)' : 'var(--clg-surface-page)',
      border: '1px solid ' + (invalid ? 'var(--clg-status-critical)' : focus ? 'var(--clg-royal)' : 'var(--clg-border-default)'),
      borderRadius: 'var(--clg-radius-sm)',
      padding: '11px 12px',
      outline: 'none',
      boxShadow: focus && !invalid ? 'var(--clg-focus-ring)' : 'none',
      transition: 'border-color var(--clg-dur-base) var(--clg-ease-out), box-shadow var(--clg-dur-base) var(--clg-ease-out)',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio control. Round, since a radio must read as a radio. */
function Radio({
  label,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--clg-action-disabled-fg)' : 'var(--clg-text-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      flex: 'none',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid ' + (checked ? 'var(--clg-royal)' : 'var(--clg-border-default)'),
      background: disabled ? 'var(--clg-surface-subtle)' : 'var(--clg-surface-page)'
    }
  }, checked ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: '50%',
      background: 'var(--clg-royal)'
    }
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--clg-size-body)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select styled to match Input, with a chevron drawn by the brand's border colour. */
function Select({
  options = [],
  invalid = false,
  disabled = false,
  placeholder,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      appearance: 'none',
      fontFamily: 'var(--clg-font-body)',
      fontSize: 'var(--clg-size-body)',
      color: disabled ? 'var(--clg-action-disabled-fg)' : 'var(--clg-text-body)',
      background: disabled ? 'var(--clg-surface-subtle)' : 'var(--clg-surface-page)',
      border: '1px solid ' + (invalid ? 'var(--clg-status-critical)' : focus ? 'var(--clg-royal)' : 'var(--clg-border-default)'),
      borderRadius: 'var(--clg-radius-sm)',
      padding: '11px 36px 11px 12px',
      outline: 'none',
      boxShadow: focus && !invalid ? 'var(--clg-focus-ring)' : 'none',
      ...style
    }
  }, rest), placeholder ? /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder) : null, options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      width: 8,
      height: 8,
      borderRight: '2px solid var(--clg-cool)',
      borderBottom: '2px solid var(--clg-cool)',
      transform: 'translateY(-70%) rotate(45deg)',
      pointerEvents: 'none'
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Binary toggle. The only pill-shaped control in the system. */
function Switch({
  label,
  checked,
  defaultChecked,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const isOn = checked === undefined ? internal : checked;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--clg-action-disabled-fg)' : 'var(--clg-text-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    checked: isOn,
    disabled: disabled,
    onChange: e => {
      if (checked === undefined) setInternal(e.target.checked);
      onChange && onChange(e);
    },
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 24,
      flex: 'none',
      borderRadius: 'var(--clg-radius-pill)',
      padding: 2,
      boxSizing: 'border-box',
      background: disabled ? 'var(--clg-action-disabled-bg)' : isOn ? 'var(--clg-royal)' : 'var(--clg-mercury)',
      transition: 'background-color var(--clg-dur-base) var(--clg-ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: '#fff',
      transform: 'translateX(' + (isOn ? 18 : 0) + 'px)',
      transition: 'transform var(--clg-dur-base) var(--clg-ease-out)'
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--clg-size-body)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Link = __ds_scope.Link;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.StarMark = __ds_scope.StarMark;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.StatBlock = __ds_scope.StatBlock;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

})();
