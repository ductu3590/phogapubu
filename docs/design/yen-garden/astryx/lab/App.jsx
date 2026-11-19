import {useState} from 'react';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {List, ListItem} from '@astryxdesign/core/List';
import {Divider} from '@astryxdesign/core/Divider';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TextArea} from '@astryxdesign/core/TextArea';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Section} from '@astryxdesign/core/Section';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {
  BellIcon, PlusIcon, MinusIcon, UserIcon, PhoneIcon, LockClosedIcon, DocumentTextIcon,
  BookOpenIcon, ClipboardDocumentListIcon, ChevronLeftIcon, MagnifyingGlassIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline';

const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`;
const vnd = (n) => n.toLocaleString('vi-VN') + 'đ';

const MENU = [
  {cat: 'Nướng', items: [
    {name: 'Sườn nướng mật ong', desc: 'Sườn non ướp mật ong rừng, nướng than hoa', price: 165000, img: '1544025162-d76694265947', tag: 'Bán chạy'},
    {name: 'Ba chỉ nướng riềng mẻ', desc: 'Ăn kèm bún, rau thơm, mắm tôm', price: 145000, img: '1529692236671-f1f6cf9683ba'},
    {name: 'Gà đồi nướng lá móc mật nguyên con (1,6–1,8 kg)', desc: 'Đặt trước 30 phút', price: 420000, img: '1598515214211-89d3c73ae83b', tag: 'Món của quán'},
    {name: 'Xiên nướng thập cẩm', desc: null, price: 25000, img: '1555939594-58d7cb561ad1'},
  ]},
  {cat: 'Bia & đồ uống', items: [
    {name: 'Bia hơi Hà Nội', desc: 'Tháp · Ca · Cốc', price: 15000, img: '1535958636474-b021ee887b13'},
    {name: 'Tiger Crystal lon', desc: null, price: 25000, img: '1608270586620-248524c67de9'},
  ]},
];

function TopBar({title, sub, back}) {
  return (
    <div className="topbar">
      <HStack gap={3} vAlign="center">
        {back ? <IconButton variant="ghost" label="Quay lại" icon={<Icon icon={ChevronLeftIcon} />} /> : <img className="logo" src="/logo.jpg" alt="" />}
        <VStack gap={0} xstyle={undefined}>
          {title ? <Heading level={4}>{title}</Heading> : <span className="brand">Yên Garden</span>}
          <Text type="supporting" color="secondary">{sub}</Text>
        </VStack>
      </HStack>
    </div>
  );
}

function NavBar({active, items}) {
  return (
    <nav className="navbar">
      {items.map(([label, Ic]) => (
        <button key={label} aria-current={active === label ? 'page' : undefined}><Ic />{label}</button>
      ))}
    </nav>
  );
}
const TABLE_NAV = [['Thực đơn', BookOpenIcon], ['Đơn gọi', ClipboardDocumentListIcon]];

function Dish({d}) {
  return (
    <ListItem
      align="start"
      label={<VStack gap={0.5}>
        {d.tag && <span className="tag">{d.tag}</span>}
        <Text weight="semibold">{d.name}</Text>
      </VStack>}
      description={<VStack gap={1}>
        {d.desc && <Text type="supporting" color="secondary" maxLines={2}>{d.desc}</Text>}
        <span className="price">{vnd(d.price)}</span>
      </VStack>}
      endContent={<div className="dish-box">
        <img className="dish-img" src={IMG(d.img)} alt="" />
        <span className="dish-add"><IconButton size="sm" variant="primary" label={`Thêm ${d.name}`} icon={<Icon icon={PlusIcon} />} /></span>
      </div>}
    />
  );
}

function Dock({cart = true, quick = true, nav = TABLE_NAV, active = 'Thực đơn', children}) {
  return (
    <div className="dock">
      <div className="dock-inner">
        {children}
        {quick && (
          <div className="quick">
            <span className="quick-ic">🍺</span>
            <VStack gap={0} xstyle={undefined}>
              <Text weight="semibold">Bia hơi Hà Nội</Text>
              <Text type="supporting" color="secondary">Ca 1 lít · 60.000đ</Text>
            </VStack>
            <span style={{marginInlineStart: 'auto'}}><Button size="sm" variant="secondary" label="Thêm 1" icon={<Icon icon={PlusIcon} />} /></span>
          </div>
        )}
        {cart && (
          <div className="cartbar">
            <HStack gap={2} vAlign="center"><span className="cart-count">3</span><span><b>255.000đ</b></span></HStack>
            <span className="cart-cta">Xem giỏ & gửi</span>
          </div>
        )}
      </div>
      {nav && <NavBar active={active} items={nav} />}
    </div>
  );
}

function MenuScreen() {
  const [tab, setTab] = useState('Nướng');
  return (
    <div className="phone">
      <div className="topbar">
        <HStack gap={3} vAlign="center" justify="between">
          <HStack gap={2} vAlign="center">
            <img className="logo" src="/logo.jpg" alt="" />
            <VStack gap={0}>
              <span className="brand">Yên Garden</span>
              <Text type="supporting" color="secondary">Bàn 1 · tạm tính 205.000đ</Text>
            </VStack>
          </HStack>
          <Button size="sm" variant="secondary" label="Gọi nhân viên" icon={<Icon icon={BellIcon} />} xstyle={undefined} />
        </HStack>
        <div style={{marginTop: 'var(--spacing-3)'}}>
          <TextInput label="Tìm món" isLabelHidden placeholder="Tìm món…" startIcon={MagnifyingGlassIcon} value="" onChange={() => {}} />
        </div>
      </div>
      <div className="tabs-wrap">
        <TabList value={tab} onChange={setTab} hasDivider overflow="scroll">
          <Tab value="Nướng" label="Nướng" />
          <Tab value="Bia" label="Bia & đồ uống" />
          <Tab value="Lẩu" label="Lẩu" />
          <Tab value="Rau" label="Rau & cơm" />
        </TabList>
      </div>
      <div style={{padding: '0 var(--spacing-4)'}}>
        {MENU.map((g) => (
          <VStack key={g.cat} gap={0}>
            <HStack justify="between" vAlign="center" paddingBlock={3}>
              <span className="sec-label">{g.cat}</span>
              <Text type="supporting" color="secondary">{g.items.length} món</Text>
            </HStack>
            <List hasDividers density="balanced" edge="flush">
              {g.items.map((d) => <Dish key={d.name} d={d} />)}
            </List>
          </VStack>
        ))}
      </div>
      <Dock />
    </div>
  );
}

function DetailScreen() {
  const [open, setOpen] = useState(true);
  const [size, setSize] = useState('ca');
  const [note, setNote] = useState('');
  return (
    <>
      <MenuScreen />
      <BottomSheet label="Bia hơi Hà Nội" isOpen={open} onOpenChange={setOpen} height="tall" purpose="form">
        <VStack gap={4}>
          <div className="hero-sheet"><img src={IMG('1535958636474-b021ee887b13').replace('w=300', 'w=700')} alt="Bia hơi Hà Nội" /></div>
          <VStack gap={1}>
            <Heading level={2}>Bia hơi Hà Nội</Heading>
            <Text color="secondary">Bia tươi trong ngày, giữ lạnh bằng đá.</Text>
          </VStack>
          <RadioList label="Chọn cỡ" value={size} onChange={setSize}>
            <RadioListItem value="coc" label="Cốc 0,3 lít" description="15.000đ" />
            <RadioListItem value="ca" label="Ca 1 lít" description="60.000đ" />
            <RadioListItem value="thap" label="Tháp 3 lít" description="170.000đ" />
          </RadioList>
          <TextArea label="Ghi chú cho quán (không bắt buộc)" placeholder="Ví dụ: thêm đá, mang ra sau" rows={2} value={note} onChange={setNote} />
          <HStack gap={3} vAlign="center">
            <span className="stepper">
              <IconButton label="Bớt" icon={<Icon icon={MinusIcon} />} />
              <b>1</b>
              <IconButton label="Thêm" icon={<Icon icon={PlusIcon} />} />
            </span>
            <Button variant="primary" size="lg" label="Thêm vào giỏ · 60.000đ" width="100%" />
          </HStack>
        </VStack>
      </BottomSheet>
    </>
  );
}

const CART = [
  {name: 'Sườn nướng mật ong', opt: null, qty: 1, price: 165000},
  {name: 'Bia hơi Hà Nội', opt: 'Ca 1 lít', qty: 1, price: 60000},
  {name: 'Xiên nướng thập cẩm', opt: 'Ghi chú: ít cay', qty: 2, price: 25000},
];

function ConfirmScreen() {
  const total = CART.reduce((s, c) => s + c.qty * c.price, 0);
  return (
    <div className="phone">
      <TopBar back title="Xác nhận đơn" sub="Bàn 1 · Yên Garden" />
      <div style={{padding: '0 var(--spacing-4)'}}>
        <List hasDividers density="spacious" edge="flush">
          {CART.map((c) => (
            <ListItem key={c.name} align="start"
              label={<Text weight="semibold">{c.name}</Text>}
              description={<VStack gap={1}>{c.opt && <Text type="supporting" color="secondary">{c.opt}</Text>}<span className="price">{vnd(c.price * c.qty)}</span></VStack>}
              endContent={<span className="stepper">
                <IconButton size="sm" label="Bớt" icon={<Icon icon={MinusIcon} />} />
                <b>{c.qty}</b>
                <IconButton size="sm" label="Thêm" icon={<Icon icon={PlusIcon} />} />
              </span>}
            />
          ))}
        </List>
        <Button variant="ghost" label="Gọi thêm món" icon={<Icon icon={PlusIcon} />} />
        <Divider />
        <VStack gap={2} paddingBlock={4}>
          <TextArea label="Ghi chú cho cả đơn (không bắt buộc)" placeholder="Ví dụ: ra món nướng trước" rows={2} value="" onChange={() => {}} />
        </VStack>
      </div>
      <div className="dock">
        <div className="dock-inner">
          <HStack justify="between" vAlign="end" paddingInline={1}>
            <VStack gap={0}><Text type="supporting" color="secondary">Tổng cộng · 4 món</Text><span className="price-lg">{vnd(total)}</span></VStack>
            <Text type="supporting" color="secondary">Trả tại quầy</Text>
          </HStack>
          <Button variant="primary" size="lg" label="Gửi đơn cho quán" width="100%" />
        </div>
      </div>
    </div>
  );
}

const ROUNDS = [
  {no: '02', time: '14:10', status: ['warning', 'Chờ quán xác nhận'], items: [['Bia hơi Hà Nội (Ca 1 lít)', 1, 60000]]},
  {no: '01', time: '12:43', status: ['success', 'Quán đã nhận'], items: [['Ba chỉ nướng riềng mẻ', 1, 145000]]},
];

function OrdersScreen() {
  return (
    <div className="phone">
      <TopBar title="Đơn gọi" sub="Bàn 1 · vào lúc 12:43" />
      <VStack gap={1} paddingInline={4} paddingBlock={3}>
        <Text type="supporting" color="secondary">Tổng tạm tính</Text>
        <span className="price-lg">205.000đ</span>
        <Text type="supporting" color="secondary">Thanh toán tại quầy thu ngân khi kết thúc bữa.</Text>
      </VStack>
      <Divider />
      <VStack gap={0} paddingInline={4}>
        <HStack justify="between" vAlign="center" paddingBlock={3}>
          <span className="sec-label">2 lượt gọi</span>
          <Text type="supporting" color="secondary">Mới nhất ở trên</Text>
        </HStack>
        {ROUNDS.map((r, i) => (
          <VStack key={r.no} gap={2} paddingBlock={3}>
            <HStack justify="between" vAlign="center">
              <Text weight="semibold">Lượt {r.no} · {r.time}</Text>
              <HStack gap={1.5} vAlign="center"><StatusDot variant={r.status[0]} label={r.status[1]} /><Text type="supporting">{r.status[1]}</Text></HStack>
            </HStack>
            <div className="round-line">
              {r.items.map(([n, q, p]) => (
                <HStack key={n} justify="between"><Text>{n}</Text><Text color="secondary">×{q} · <span className="price">{vnd(p)}</span></Text></HStack>
              ))}
            </div>
            {i < ROUNDS.length - 1 && <Divider />}
          </VStack>
        ))}
      </VStack>
      <Dock quick={false} cart={false} active="Đơn gọi">
        <Button variant="primary" size="lg" label="Gọi thêm món" icon={<Icon icon={PlusIcon} />} width="100%" />
      </Dock>
    </div>
  );
}

function ReserveScreen() {
  const days = [['Hôm nay', 18], ['T5', 19], ['T6', 20], ['T7', 21], ['CN', 22]];
  const slots = ['16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45'];
  return (
    <div className="phone">
      <TopBar title="Đặt bàn" sub="Yên Garden · giữ chỗ miễn phí" />
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <span className="sec-label">Người đặt</span>
          <TextInput label="Họ và tên" placeholder="Tên người đặt" value="" onChange={() => {}} />
          <TextInput label="Số điện thoại" type="tel" placeholder="Ví dụ 0962 345 678" value="" onChange={() => {}} />
        </VStack>
      </Section>
      <Divider />
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <span className="sec-label">Thời gian đến</span>
          <div className="days">{days.map(([d, n], i) => <button key={n} className="day" aria-pressed={i === 0}><small>{d}</small><b>{n}</b><small>Th11</small></button>)}</div>
          <HStack justify="between"><Text type="supporting" color="secondary">Khung giờ</Text><Text type="supporting" color="secondary">Mỗi 15 phút</Text></HStack>
          <div className="slots">{slots.map((s) => <button key={s} className="slot" aria-pressed={s === '18:00'}>{s}</button>)}</div>
        </VStack>
      </Section>
      <Divider />
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <span className="sec-label">Số khách</span>
          <span className="stepper"><IconButton label="Bớt" icon={<Icon icon={MinusIcon} />} /><b>4</b><IconButton label="Thêm" icon={<Icon icon={PlusIcon} />} /></span>
        </VStack>
      </Section>
      <Dock quick={false} cart={false} nav={[['Trang chủ', BookOpenIcon], ['Đặt bàn', CalendarDaysIcon]]} active="Đặt bàn">
        <Button variant="primary" size="lg" label="Xác nhận đặt bàn · 18:00 hôm nay" width="100%" />
      </Dock>
    </div>
  );
}

function AccountScreen() {
  return (
    <div className="phone">
      <TopBar back title="Tài khoản" sub="Yên Garden" />
      <HStack gap={3} vAlign="center" paddingInline={4} paddingBlock={3}>
        <Avatar size={56} name="Khách" />
        <VStack gap={0}><Heading level={3}>Khách</Heading><Text type="supporting" color="secondary">Chưa kết nối Zalo</Text></VStack>
      </HStack>
      <Divider />
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <HStack gap={2} vAlign="center"><Icon icon={PhoneIcon} color="secondary" /><span className="sec-label">Thông tin liên hệ</span></HStack>
          <Text type="supporting" color="secondary">Tự điền khi bạn đặt bàn.</Text>
          <TextInput label="Tên" placeholder="Tên để quán gọi bạn" value="" onChange={() => {}} />
          <div className="zalo-btn">Lấy số từ Zalo</div>
          <Button variant="ghost" label="Nhập số tay" />
        </VStack>
      </Section>
      <Divider />
      <VStack gap={0} paddingInline={4}>
        <List hasDividers edge="flush">
          <ListItem label="Quyền riêng tư" description="Tên và số chỉ lưu trên máy này" startContent={<Icon icon={LockClosedIcon} color="secondary" />} endContent={<Icon icon="chevronRight" color="secondary" />} onClick={() => {}} />
          <ListItem label="Điều khoản sử dụng" startContent={<Icon icon={DocumentTextIcon} color="secondary" />} endContent={<Icon icon="chevronRight" color="secondary" />} onClick={() => {}} />
          <ListItem label={<span className="danger">Xoá thông tin cá nhân</span>} startContent={<Icon icon={UserIcon} color="error" />} onClick={() => {}} />
        </List>
      </VStack>
      <div className="foot">Vận hành bởi MEVO</div>
    </div>
  );
}

const SCREENS = {menu: MenuScreen, detail: DetailScreen, confirm: ConfirmScreen, orders: OrdersScreen, reserve: ReserveScreen, account: AccountScreen};

export default function App() {
  const s = new URLSearchParams(location.search).get('s') || 'menu';
  const Screen = SCREENS[s] || MenuScreen;
  return <Screen />;
}
