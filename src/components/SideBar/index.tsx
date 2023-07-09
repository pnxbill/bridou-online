import { component$, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';
import { Link, useLocation, useNavigate } from '@builder.io/qwik-city';
import { LuUsers, LuRadio, LuTrophy } from '@qwikest/icons/lucide';

type TSideBarItem = {
  href: string;
};

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

  console.log(url.pathname.slice(0, -1));

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
