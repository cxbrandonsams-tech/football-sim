/**
 * Shared UI Components — reusable building blocks for the app.
 * These replace repeated patterns across views with consistent, styled components.
 */
import { type ReactNode } from 'react';

// ── Section Header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header-text">
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  accent?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
}

export function Card({ title, subtitle, actions, children, className = '', compact, accent }: CardProps) {
  const cls = [
    'ui-card',
    compact && 'ui-card--compact',
    accent && `ui-card--${accent}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {(title || actions) && (
        <div className="ui-card-header">
          <div>
            {title && <div className="ui-card-title">{title}</div>}
            {subtitle && <div className="ui-card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}
      <div className="ui-card-body">
        {children}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title?: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, message, action, compact }: EmptyStateProps) {
  return (
    <div className={`ui-empty-state${compact ? ' ui-empty-state--compact' : ''}`}>
      {icon && <div className="ui-empty-state-icon">{icon}</div>}
      {title && <div className="ui-empty-state-title">{title}</div>}
      <div className="ui-empty-state-msg">{message}</div>
      {action && <div className="ui-empty-state-action">{action}</div>}
    </div>
  );
}

// ── Loading State ────────────────────────────────────────────────────────────

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="ui-loading-state">
      <div className="ui-loading-spinner" />
      <span>{message}</span>
    </div>
  );
}

// ── Stat Block ───────────────────────────────────────────────────────────────

interface StatBlockProps {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: boolean;
}

export function StatBlock({ label, value, sublabel, accent }: StatBlockProps) {
  return (
    <div className={`ui-stat-block${accent ? ' ui-stat-block--accent' : ''}`}>
      <div className="ui-stat-label">{label}</div>
      <div className="ui-stat-value">{value}</div>
      {sublabel && <div className="ui-stat-sublabel">{sublabel}</div>}
    </div>
  );
}

// ── Key-Value Row ────────────────────────────────────────────────────────────

interface KVRowProps {
  label: string;
  value: ReactNode;
  muted?: boolean;
}

export function KVRow({ label, value, muted }: KVRowProps) {
  return (
    <div className={`ui-kv-row${muted ? ' ui-kv-row--muted' : ''}`}>
      <span className="ui-kv-label">{label}</span>
      <span className="ui-kv-value">{value}</span>
    </div>
  );
}

// ── Tab Bar ──────────────────────────────────────────────────────────────────

interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  size?: 'sm' | 'md';
}

export function TabBar({ tabs, activeId, onSelect, size = 'md' }: TabBarProps) {
  return (
    <div className={`ui-tab-bar ui-tab-bar--${size}`}>
      {tabs.map(t => (
        <button
          key={t.id}
          className={`ui-tab${activeId === t.id ? ' ui-tab--active' : ''}${t.disabled ? ' ui-tab--disabled' : ''}`}
          onClick={() => !t.disabled && onSelect(t.id)}
          disabled={t.disabled}
        >
          {t.label}
          {t.badge != null && <span className="ui-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
