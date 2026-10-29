-- LOCAL DEVELOPMENT ONLY. Placeholder car wash numbers (BUILD_BRIEF §14 is undecided): replace via admin.
insert into public.carwash_rates (package, vehicle, customer_price, partner_payout) values
  ('exterior','saloon',3000,2000), ('exterior','suv',4000,2800), ('exterior','van',5000,3500), ('exterior','pickup',4500,3100),
  ('full','saloon',6000,4200), ('full','suv',8000,5600), ('full','van',10000,7000), ('full','pickup',9000,6300),
  ('detailing','saloon',20000,14000), ('detailing','suv',26000,18200), ('detailing','van',32000,22400), ('detailing','pickup',28000,19600)
on conflict do nothing;
update public.carwash_settings set service_fee = 500, mobile_bonus = 1000;
