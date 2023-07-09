import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { Link, useLocation } from '@builder.io/qwik-city';
import { LuUsers, LuRadio, LuTrophy } from '@qwikest/icons/lucide';
import styles from './styles.css?inline';

const SIDEBAR_ITEM = [
  {
    href: '/live',
    icon: LuRadio,
  },
  {
    href: '/rank',
    icon: LuTrophy,
  },
  {
    href: '/friends',
    icon: LuUsers,
  },
];

export default component$(() => {
  useStylesScoped$(styles);
  const { url } = useLocation();

  return (
    <div class="sidebar">
      <ul>
        {SIDEBAR_ITEM.map((item) => {
          const Icon = item.icon;
          const isActive = url.pathname.slice(0, -1) === item.href;
          return (
            <li>
              <Link href={item.href}>
                <Icon class={isActive ? 'active' : ''} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
